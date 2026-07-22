import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const macosRoot = path.resolve(here, "..");

export const PET_ID = "yinyue";
export const PET_DISPLAY_NAME = "银月";
export const PET_STATE_SCHEMA_VERSION = 1;
export const PET_FAMILY_SCHEMA_VERSION = 1;
export const PET_SPRITE_VERSION = 2;
export const REALM_IDS = Object.freeze([
  "qi",
  "foundation",
  "golden-core",
  "nascent-soul",
  "transformation",
]);

const MANAGED_BY = "CodexCultivation";
const EXPECTED_ATLAS = Object.freeze({ width: 1536, height: 2288 });
const EXPECTED_TAIL_COUNTS = Object.freeze({
  qi: 1,
  foundation: 2,
  "golden-core": 3,
  "nascent-soul": 5,
  transformation: 9,
});
const SAFE_MANAGED_FILE = /^spritesheet-(?:qi|foundation|golden-core|nascent-soul|transformation)-[a-f0-9]{12}\.webp$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultStateRoot(env = process.env) {
  const home = env.HOME || os.homedir();
  if (!home) throw new Error("HOME is required to manage the Silver Moon pet state");
  return path.resolve(home, "Library", "Application Support", "CodexCultivation");
}

function defaultCodexHome(env = process.env) {
  if (env.CODEX_HOME) return path.resolve(env.CODEX_HOME);
  const home = env.HOME || os.homedir();
  if (!home) throw new Error("HOME or CODEX_HOME is required to locate Codex pets");
  return path.resolve(home, ".codex");
}

export function defaultPetFamilyPath() {
  return path.join(macosRoot, "pets", PET_ID, "pet-family.json");
}

export function resolvePetPaths(options = {}) {
  const stateRoot = path.resolve(options.stateRoot ?? defaultStateRoot(options.env));
  const codexHome = path.resolve(options.codexHome ?? defaultCodexHome(options.env));
  return {
    stateRoot,
    statePath: path.join(stateRoot, "pet-state.json"),
    lockPath: path.join(stateRoot, "pet-state.lock"),
    disablePath: path.join(stateRoot, "spirit-pet-disabled"),
    codexHome,
    petsRoot: path.join(codexHome, "pets"),
    petDir: path.join(codexHome, "pets", PET_ID),
    petJsonPath: path.join(codexHome, "pets", PET_ID, "pet.json"),
  };
}

function assertRelativePath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
}

function resolveInside(root, relative, label) {
  assertRelativePath(relative, label);
  const resolved = path.resolve(root, relative);
  const relation = path.relative(root, resolved);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`${label} must remain inside ${root}`);
  }
  return resolved;
}

async function pathExists(value) {
  try {
    await fs.lstat(value);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNotLink(value, label, { allowMissing = false } = {}) {
  let stat;
  try {
    stat = await fs.lstat(value);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} cannot be a symbolic link or junction`);
}

async function readJson(value, label, { allowMissing = false } = {}) {
  let text;
  try {
    text = await fs.readFile(value, "utf8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw new Error(`${label} could not be read: ${error?.message ?? error}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error?.message ?? error}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(value) {
  return sha256(await fs.readFile(value));
}

async function atomicWrite(value, content) {
  const parent = path.dirname(value);
  await fs.mkdir(parent, { recursive: true });
  await assertNotLink(parent, "Managed output directory");
  const temporary = path.join(parent, `.${path.basename(value)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { flag: "wx" });
    await fs.rename(temporary, value);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function atomicCopy(source, destination) {
  await atomicWrite(destination, await fs.readFile(source));
}

async function acquirePetLock(lockPath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return async () => {
        await handle.close().catch(() => {});
        await fs.rm(lockPath, { force: true }).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 60_000) {
        await fs.rm(lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) throw new Error("Timed out waiting for the Silver Moon pet operation lock");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function withPetLock(paths, operation) {
  const release = await acquirePetLock(paths.lockPath);
  try {
    return await operation();
  } finally {
    await release();
  }
}

function validateState(value) {
  if (!isObject(value) || value.schemaVersion !== PET_STATE_SCHEMA_VERSION ||
      value.managedBy !== MANAGED_BY || value.petId !== PET_ID) {
    throw new Error("Silver Moon pet state is not a supported Codex Cultivation state file");
  }
  if (!REALM_IDS.includes(value.activeRealm) || typeof value.activeSpritesheet !== "string" ||
      !SAFE_MANAGED_FILE.test(value.activeSpritesheet) || typeof value.activeSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.activeSha256) || typeof value.petJsonSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.petJsonSha256) || !Array.isArray(value.managedFiles)) {
    throw new Error("Silver Moon pet state contains invalid managed file metadata");
  }
  for (const file of value.managedFiles) {
    if (!isObject(file) || typeof file.name !== "string" || !SAFE_MANAGED_FILE.test(file.name) ||
        typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error("Silver Moon pet state contains an unsafe managed file entry");
    }
  }
  return value;
}

async function readState(statePath) {
  const value = await readJson(statePath, "Silver Moon pet state", { allowMissing: true });
  return value === null ? null : validateState(value);
}

async function writeState(statePath, state) {
  const text = `${JSON.stringify(state, null, 2)}\n`;
  await atomicWrite(statePath, text);
  return state;
}

async function validateAssetFile(familyRoot, relativePath, label) {
  const resolved = resolveInside(familyRoot, relativePath, label);
  await assertNotLink(resolved, label);
  const realRoot = await fs.realpath(familyRoot);
  const realAsset = await fs.realpath(resolved);
  const relation = path.relative(realRoot, realAsset);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`${label} escapes the Silver Moon family directory`);
  }
  return resolved;
}

export async function loadPetFamily(familyPath = defaultPetFamilyPath()) {
  const resolvedFamilyPath = path.resolve(familyPath);
  await assertNotLink(resolvedFamilyPath, "Silver Moon family manifest");
  const familyRoot = path.dirname(resolvedFamilyPath);
  await assertNotLink(familyRoot, "Silver Moon family directory");
  const manifest = await readJson(resolvedFamilyPath, "Silver Moon family manifest");
  if (!isObject(manifest) || manifest.schemaVersion !== PET_FAMILY_SCHEMA_VERSION ||
      manifest.id !== PET_ID || manifest.displayName !== PET_DISPLAY_NAME ||
      manifest.spriteVersionNumber !== PET_SPRITE_VERSION ||
      !REALM_IDS.includes(manifest.defaultRealm) || !isObject(manifest.forms)) {
    throw new Error("Silver Moon family manifest has an unsupported identity or schema");
  }
  const formIds = Object.keys(manifest.forms).sort();
  if (formIds.length !== REALM_IDS.length ||
      REALM_IDS.some((realm) => !Object.prototype.hasOwnProperty.call(manifest.forms, realm))) {
    throw new Error("Silver Moon family manifest must define exactly the five cultivation realms");
  }

  const forms = {};
  for (const realm of REALM_IDS) {
    const form = manifest.forms[realm];
    if (!isObject(form) || typeof form.displayName !== "string" || !form.displayName.trim() ||
        typeof form.description !== "string" || !form.description.trim() ||
        form.tailCount !== EXPECTED_TAIL_COUNTS[realm]) {
      throw new Error(`Silver Moon ${realm} form metadata is incomplete`);
    }
    const spritesheetPath = await validateAssetFile(
      familyRoot,
      form.spritesheet,
      `Silver Moon ${realm} spritesheet`,
    );
    const validationPath = await validateAssetFile(
      familyRoot,
      form.validation,
      `Silver Moon ${realm} validation`,
    );
    if (path.extname(spritesheetPath).toLowerCase() !== ".webp") {
      throw new Error(`Silver Moon ${realm} spritesheet must be WebP`);
    }
    const spritesheetBytes = await fs.readFile(spritesheetPath);
    const metadata = readImageMetadata(spritesheetBytes, ".webp");
    if (!metadata || metadata.width !== EXPECTED_ATLAS.width || metadata.height !== EXPECTED_ATLAS.height) {
      throw new Error(`Silver Moon ${realm} spritesheet must be exactly 1536x2288`);
    }
    const validation = await readJson(validationPath, `Silver Moon ${realm} validation`);
    if (!isObject(validation) || validation.ok !== true || validation.format !== "WEBP" ||
        validation.mode !== "RGBA" || validation.columns !== 8 || validation.rows !== 11 ||
        validation.sprite_version_number !== PET_SPRITE_VERSION ||
        validation.width !== EXPECTED_ATLAS.width || validation.height !== EXPECTED_ATLAS.height ||
        !Array.isArray(validation.errors) || validation.errors.length !== 0) {
      throw new Error(`Silver Moon ${realm} validation does not match the Pet v2 atlas contract`);
    }
    forms[realm] = {
      ...form,
      spritesheetPath,
      validationPath,
      sha256: sha256(spritesheetBytes),
      metadata,
      validation,
    };
  }
  return { familyPath: resolvedFamilyPath, familyRoot, manifest, forms };
}

async function assertManagedDirectory(paths, state) {
  if (!await pathExists(paths.petDir)) return;
  await assertNotLink(paths.petsRoot, "Codex pets directory");
  await assertNotLink(paths.petDir, "Silver Moon pet directory");
  if (!state) {
    throw new Error(`Refusing to overwrite unmanaged pet directory: ${paths.petDir}`);
  }

  if (await pathExists(paths.petJsonPath)) {
    await assertNotLink(paths.petJsonPath, "Silver Moon pet manifest");
    if (await hashFile(paths.petJsonPath) !== state.petJsonSha256) {
      throw new Error("Refusing to overwrite a Silver Moon pet manifest modified outside Codex Cultivation");
    }
  }
  for (const file of state.managedFiles) {
    const managedPath = path.join(paths.petDir, file.name);
    if (!await pathExists(managedPath)) continue;
    await assertNotLink(managedPath, `Managed Silver Moon file ${file.name}`);
    if (await hashFile(managedPath) !== file.sha256) {
      throw new Error(`Refusing to overwrite managed Silver Moon file modified outside Codex Cultivation: ${file.name}`);
    }
  }
}

function buildPetJson(form, spritesheetName) {
  return {
    id: PET_ID,
    displayName: PET_DISPLAY_NAME,
    description: form.description,
    spriteVersionNumber: PET_SPRITE_VERSION,
    spritesheetPath: spritesheetName,
  };
}

function stateManagedFiles(state, activeName, activeHash) {
  const byName = new Map((state?.managedFiles ?? []).map((file) => [file.name, file]));
  byName.set(activeName, { name: activeName, sha256: activeHash });
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function setSpiritPetRealm({
  realm,
  familyPath = defaultPetFamilyPath(),
  stateRoot,
  codexHome,
  env,
} = {}) {
  if (!REALM_IDS.includes(realm)) throw new Error(`Unsupported Silver Moon realm: ${realm}`);
  const family = await loadPetFamily(familyPath);
  const form = family.forms[realm];
  const paths = resolvePetPaths({ stateRoot, codexHome, env });
  return withPetLock(paths, async () => {
    const state = await readState(paths.statePath);
    await assertManagedDirectory(paths, state);
    await fs.mkdir(paths.petDir, { recursive: true });
    await assertNotLink(paths.petDir, "Silver Moon pet directory");

    const spritesheetName = `spritesheet-${realm}-${form.sha256.slice(0, 12)}.webp`;
    const spritesheetPath = path.join(paths.petDir, spritesheetName);
    const petJson = buildPetJson(form, spritesheetName);
    const petJsonText = `${JSON.stringify(petJson, null, 2)}\n`;
    const petJsonSha256 = sha256(petJsonText);
    const unchanged = state?.activeRealm === realm && state.activeSha256 === form.sha256 &&
      state.activeSpritesheet === spritesheetName && state.petJsonSha256 === petJsonSha256 &&
      await pathExists(spritesheetPath) && await hashFile(spritesheetPath) === form.sha256 &&
      await pathExists(paths.petJsonPath) && await hashFile(paths.petJsonPath) === petJsonSha256;
    if (unchanged) {
      return {
        ok: true,
        changed: false,
        realm,
        spritesheetName,
        pendingReload: Boolean(state.pendingReload),
        statePath: paths.statePath,
        petDir: paths.petDir,
      };
    }

    if (await pathExists(spritesheetPath) && await hashFile(spritesheetPath) !== form.sha256) {
      throw new Error(`Refusing to replace conflicting Silver Moon spritesheet: ${spritesheetName}`);
    }
    if (!await pathExists(spritesheetPath)) await atomicCopy(form.spritesheetPath, spritesheetPath);
    await atomicWrite(paths.petJsonPath, petJsonText);

    const now = new Date().toISOString();
    const nextState = {
      schemaVersion: PET_STATE_SCHEMA_VERSION,
      managedBy: MANAGED_BY,
      petId: PET_ID,
      activeRealm: realm,
      activeSpritesheet: spritesheetName,
      activeSha256: form.sha256,
      petJsonSha256,
      managedFiles: stateManagedFiles(state, spritesheetName, form.sha256),
      pendingReload: true,
      pendingReason: "spritesheet-changed",
      installedAt: state?.installedAt ?? now,
      updatedAt: now,
      lastReloadVerifiedAt: state?.lastReloadVerifiedAt ?? null,
      preservedFiles: Array.isArray(state?.preservedFiles) ? state.preservedFiles : [],
    };
    await writeState(paths.statePath, nextState);
    return {
      ok: true,
      changed: true,
      realm,
      spritesheetName,
      pendingReload: true,
      statePath: paths.statePath,
      petDir: paths.petDir,
    };
  });
}

export async function recordSpiritPetReload({
  verified,
  reason = null,
  stateRoot,
  codexHome,
  env,
} = {}) {
  const paths = resolvePetPaths({ stateRoot, codexHome, env });
  return withPetLock(paths, async () => {
    const state = await readState(paths.statePath);
    if (!state) return { ok: true, installed: false, pendingReload: false };
    await assertManagedDirectory(paths, state);
    const preserved = new Set(state.preservedFiles ?? []);
    const managedFiles = [];
    if (verified) {
      for (const file of state.managedFiles) {
        if (file.name === state.activeSpritesheet) {
          managedFiles.push(file);
          continue;
        }
        const managedPath = path.join(paths.petDir, file.name);
        if (!await pathExists(managedPath)) continue;
        if (await hashFile(managedPath) === file.sha256) await fs.rm(managedPath, { force: true });
        else preserved.add(file.name);
      }
    } else {
      managedFiles.push(...state.managedFiles);
    }
    const now = new Date().toISOString();
    const nextState = {
      ...state,
      managedFiles,
      pendingReload: !verified,
      pendingReason: verified ? null : (reason || "pet-overlay-refresh-unverified"),
      updatedAt: now,
      lastReloadVerifiedAt: verified ? now : state.lastReloadVerifiedAt,
      preservedFiles: [...preserved].sort(),
    };
    await writeState(paths.statePath, nextState);
    return {
      ok: true,
      installed: true,
      realm: state.activeRealm,
      spritesheetName: state.activeSpritesheet,
      pendingReload: nextState.pendingReload,
      preservedFiles: nextState.preservedFiles,
    };
  });
}

export async function installSpiritPet({
  realm,
  familyPath = defaultPetFamilyPath(),
  stateRoot,
  codexHome,
  env,
} = {}) {
  const family = await loadPetFamily(familyPath);
  const selectedRealm = realm ?? family.manifest.defaultRealm;
  const result = await setSpiritPetRealm({ realm: selectedRealm, familyPath, stateRoot, codexHome, env });
  await recordSpiritPetReload({
    verified: true,
    reason: "installed-while-codex-closed",
    stateRoot,
    codexHome,
    env,
  });
  return { ...result, pendingReload: false };
}

export async function removeSpiritPet({ stateRoot, codexHome, env } = {}) {
  const paths = resolvePetPaths({ stateRoot, codexHome, env });
  return withPetLock(paths, async () => {
    const state = await readState(paths.statePath);
    if (!state) return { ok: true, removed: false, preservedFiles: [] };
    await assertNotLink(paths.petDir, "Silver Moon pet directory", { allowMissing: true });
    const preserved = new Set(state.preservedFiles ?? []);
    if (await pathExists(paths.petDir)) {
      for (const file of state.managedFiles) {
        const managedPath = path.join(paths.petDir, file.name);
        if (!await pathExists(managedPath)) continue;
        if (await hashFile(managedPath) === file.sha256) await fs.rm(managedPath, { force: true });
        else preserved.add(file.name);
      }
      if (await pathExists(paths.petJsonPath)) {
        if (await hashFile(paths.petJsonPath) === state.petJsonSha256) {
          await fs.rm(paths.petJsonPath, { force: true });
        } else {
          preserved.add("pet.json");
        }
      }
      const remaining = await fs.readdir(paths.petDir);
      if (remaining.length === 0) await fs.rmdir(paths.petDir);
    }
    await fs.rm(paths.statePath, { force: true });
    return { ok: true, removed: true, preservedFiles: [...preserved].sort() };
  });
}

export async function verifySpiritPet({
  familyPath = defaultPetFamilyPath(),
  stateRoot,
  codexHome,
  env,
} = {}) {
  const family = await loadPetFamily(familyPath);
  const paths = resolvePetPaths({ stateRoot, codexHome, env });
  const state = await readState(paths.statePath);
  if (!state) {
    if (await pathExists(paths.petDir)) {
      throw new Error(`Unmanaged Silver Moon pet directory blocks installation: ${paths.petDir}`);
    }
    return {
      ok: true,
      familyValid: true,
      installed: false,
      realms: REALM_IDS,
      familyPath: family.familyPath,
    };
  }
  await assertManagedDirectory(paths, state);
  if (!await pathExists(paths.petJsonPath)) throw new Error("Managed Silver Moon pet.json is missing");
  const petJson = await readJson(paths.petJsonPath, "Managed Silver Moon pet manifest");
  if (!isObject(petJson) || petJson.id !== PET_ID || petJson.displayName !== PET_DISPLAY_NAME ||
      petJson.spriteVersionNumber !== PET_SPRITE_VERSION || petJson.spritesheetPath !== state.activeSpritesheet) {
    throw new Error("Managed Silver Moon pet manifest does not match the active state");
  }
  const activePath = path.join(paths.petDir, state.activeSpritesheet);
  if (!await pathExists(activePath) || await hashFile(activePath) !== state.activeSha256) {
    throw new Error("Managed Silver Moon active spritesheet is missing or has changed");
  }
  return {
    ok: true,
    familyValid: true,
    installed: true,
    realm: state.activeRealm,
    spritesheetName: state.activeSpritesheet,
    pendingReload: Boolean(state.pendingReload),
    statePath: paths.statePath,
    petDir: paths.petDir,
  };
}

function parseArgs(argv) {
  const command = argv[0];
  if (!new Set(["verify", "install", "set-realm", "remove"]).has(command)) {
    throw new Error("Usage: pet-manager.mjs <verify|install|set-realm|remove> [options]");
  }
  const options = { command, familyPath: defaultPetFamilyPath(), realm: null, stateRoot: null, codexHome: null };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--family") options.familyPath = path.resolve(argv[++index]);
    else if (arg === "--realm") options.realm = argv[++index];
    else if (arg === "--state-root") options.stateRoot = path.resolve(argv[++index]);
    else if (arg === "--codex-home") options.codexHome = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (command === "set-realm" && !options.realm) throw new Error("set-realm requires --realm");
  return options;
}

async function runCli(options) {
  const shared = {
    familyPath: options.familyPath,
    realm: options.realm,
    stateRoot: options.stateRoot,
    codexHome: options.codexHome,
  };
  if (options.command === "verify") return verifySpiritPet(shared);
  if (options.command === "install") return installSpiritPet(shared);
  if (options.command === "set-realm") return setSpiritPetRealm(shared);
  return removeSpiritPet(shared);
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    console.log(JSON.stringify(await runCli(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
