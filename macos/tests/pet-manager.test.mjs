import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PET_ID,
  REALM_IDS,
  defaultPetFamilyPath,
  installSpiritPet,
  loadPetFamily,
  recordSpiritPetReload,
  removeSpiritPet,
  setSpiritPetRealm,
  verifySpiritPet,
} from "../scripts/pet-manager.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function vp8xFixture(width, height, marker) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes[20] = marker & 0xff;
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes[24] = encodedWidth & 0xff;
  bytes[25] = (encodedWidth >> 8) & 0xff;
  bytes[26] = (encodedWidth >> 16) & 0xff;
  bytes[27] = encodedHeight & 0xff;
  bytes[28] = (encodedHeight >> 8) & 0xff;
  bytes[29] = (encodedHeight >> 16) & 0x0f;
  return bytes;
}

async function writeFamily(root) {
  const familyRoot = path.join(root, "family");
  const forms = {};
  const tailCounts = [1, 2, 3, 5, 9];
  for (const [index, realm] of REALM_IDS.entries()) {
    const formRoot = path.join(familyRoot, "forms", realm);
    await fs.mkdir(formRoot, { recursive: true });
    await fs.writeFile(path.join(formRoot, "spritesheet.webp"), vp8xFixture(1536, 2288, index));
    await fs.writeFile(path.join(formRoot, "validation.json"), JSON.stringify({
      ok: true,
      format: "WEBP",
      mode: "RGBA",
      columns: 8,
      rows: 11,
      sprite_version_number: 2,
      width: 1536,
      height: 2288,
      errors: [],
      warnings: [],
    }));
    forms[realm] = {
      displayName: `银月·${realm}`,
      description: `Silver Moon ${realm} test form`,
      tailCount: tailCounts[index],
      spritesheet: `forms/${realm}/spritesheet.webp`,
      validation: `forms/${realm}/validation.json`,
    };
  }
  const family = {
    schemaVersion: 1,
    id: PET_ID,
    displayName: "银月",
    description: "Silver Moon test family",
    spriteVersionNumber: 2,
    defaultRealm: "qi",
    forms,
  };
  const familyPath = path.join(familyRoot, "pet-family.json");
  await fs.writeFile(familyPath, JSON.stringify(family, null, 2));
  return familyPath;
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cultivation-macos-pet-"));
  return {
    root,
    familyPath: await writeFamily(root),
    stateRoot: path.join(root, "state"),
    codexHome: path.join(root, "codex-home"),
  };
}

const fixtures = [];
try {
  {
    const fixture = await createFixture();
    fixtures.push(fixture.root);
    const otherPet = path.join(fixture.codexHome, "pets", "kun-chick", "keep.txt");
    await fs.mkdir(path.dirname(otherPet), { recursive: true });
    await fs.writeFile(otherPet, "user-pet");
    const otherHash = sha256(await fs.readFile(otherPet));

    const installed = await installSpiritPet(fixture);
    assert.equal(installed.realm, "qi");
    assert.equal(installed.pendingReload, false);
    assert.match(installed.spritesheetName, /^spritesheet-qi-[a-f0-9]{12}\.webp$/);

    const verified = await verifySpiritPet(fixture);
    assert.equal(verified.installed, true);
    assert.equal(verified.realm, "qi");
    assert.equal(sha256(await fs.readFile(otherPet)), otherHash, "Unrelated user pets must remain unchanged.");

    const petJsonPath = path.join(fixture.codexHome, "pets", PET_ID, "pet.json");
    const petJson = JSON.parse(await fs.readFile(petJsonPath, "utf8"));
    assert.deepEqual({
      id: petJson.id,
      displayName: petJson.displayName,
      spriteVersionNumber: petJson.spriteVersionNumber,
    }, { id: PET_ID, displayName: "银月", spriteVersionNumber: 2 });

    const evolved = await setSpiritPetRealm({ ...fixture, realm: "foundation" });
    assert.equal(evolved.changed, true);
    assert.equal(evolved.pendingReload, true);
    let state = JSON.parse(await fs.readFile(path.join(fixture.stateRoot, "pet-state.json"), "utf8"));
    assert.equal(state.managedFiles.length, 2, "Previous spritesheet must remain until refresh is verified.");

    const failedReload = await recordSpiritPetReload({
      ...fixture,
      verified: false,
      reason: "fixture-unverified",
    });
    assert.equal(failedReload.pendingReload, true);
    state = JSON.parse(await fs.readFile(path.join(fixture.stateRoot, "pet-state.json"), "utf8"));
    assert.equal(state.managedFiles.length, 2);

    const successfulReload = await recordSpiritPetReload({ ...fixture, verified: true });
    assert.equal(successfulReload.pendingReload, false);
    state = JSON.parse(await fs.readFile(path.join(fixture.stateRoot, "pet-state.json"), "utf8"));
    assert.equal(state.managedFiles.length, 1, "Verified refresh must clean the previous managed spritesheet.");

    const unchanged = await setSpiritPetRealm({ ...fixture, realm: "foundation" });
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.pendingReload, false);

    const removed = await removeSpiritPet(fixture);
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.preservedFiles, []);
    assert.equal(await fs.readFile(otherPet, "utf8"), "user-pet");
    await assert.rejects(fs.access(path.join(fixture.stateRoot, "pet-state.json")));
  }

  {
    const fixture = await createFixture();
    fixtures.push(fixture.root);
    const invalidValidation = path.join(
      path.dirname(fixture.familyPath),
      "forms",
      "foundation",
      "validation.json",
    );
    const validation = JSON.parse(await fs.readFile(invalidValidation, "utf8"));
    validation.sprite_version_number = 1;
    await fs.writeFile(invalidValidation, JSON.stringify(validation));
    await assert.rejects(
      loadPetFamily(fixture.familyPath),
      /Pet v2 atlas contract/,
    );
  }

  {
    const fixture = await createFixture();
    fixtures.push(fixture.root);
    const unmanagedDir = path.join(fixture.codexHome, "pets", PET_ID);
    await fs.mkdir(unmanagedDir, { recursive: true });
    await fs.writeFile(path.join(unmanagedDir, "pet.json"), JSON.stringify({ id: PET_ID, owner: "user" }));
    await assert.rejects(
      installSpiritPet(fixture),
      /Refusing to overwrite unmanaged pet directory/,
    );
    assert.equal(JSON.parse(await fs.readFile(path.join(unmanagedDir, "pet.json"), "utf8")).owner, "user");
  }

  {
    const fixture = await createFixture();
    fixtures.push(fixture.root);
    const installed = await installSpiritPet(fixture);
    const activePath = path.join(fixture.codexHome, "pets", PET_ID, installed.spritesheetName);
    await fs.appendFile(activePath, "user-modification");
    await assert.rejects(
      setSpiritPetRealm({ ...fixture, realm: "golden-core" }),
      /modified outside Codex Cultivation/,
    );
    const removed = await removeSpiritPet(fixture);
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.preservedFiles, [installed.spritesheetName]);
    assert.equal(await fs.readFile(activePath, "utf8").then(() => true), true,
      "Removal must preserve a managed filename whose content no longer matches its recorded hash.");
  }

  {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cultivation-macos-real-pet-"));
    fixtures.push(root);
    const fixture = {
      root,
      familyPath: defaultPetFamilyPath(),
      stateRoot: path.join(root, "state"),
      codexHome: path.join(root, "codex-home"),
    };
    const installedNames = new Set();
    const installed = await installSpiritPet(fixture);
    installedNames.add(installed.spritesheetName);
    assert.equal((await verifySpiritPet(fixture)).realm, "qi");
    for (const realm of REALM_IDS.slice(1)) {
      const evolved = await setSpiritPetRealm({ ...fixture, realm });
      installedNames.add(evolved.spritesheetName);
      assert.equal((await verifySpiritPet(fixture)).realm, realm);
    }
    assert.equal(installedNames.size, REALM_IDS.length,
      "The packaged five-realm family must contain five independently versioned atlases.");
    const removed = await removeSpiritPet(fixture);
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.preservedFiles, []);
  }

  console.log("PASS: macOS Silver Moon pet manager validates the packaged five realms, evolves, protects collisions, and removes managed files safely.");
} finally {
  await Promise.all(fixtures.map((fixture) => fs.rm(fixture, { recursive: true, force: true })));
}
