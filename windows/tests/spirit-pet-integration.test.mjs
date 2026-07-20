import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isExpectedYinyueResourceProbe,
  isYinyuePetProbe,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFile(path.join(root, relative), "utf8");

assert.equal(isYinyuePetProbe({ app: true, avatar: true, shell: false }), true);
assert.equal(isYinyuePetProbe({ app: true, avatar: true, shell: true }), false,
  "The main Codex shell must never be treated as a pet overlay.");
assert.equal(isYinyuePetProbe({ app: true, avatar: false, shell: false }), false,
  "A different pet window must remain untouched.");
assert.equal(isYinyuePetProbe({ app: false, avatar: true, shell: false }), false,
  "Only app:// pet targets are eligible for reload.");
assert.equal(isExpectedYinyueResourceProbe({ avatar: true, loaded: true }), true);
assert.equal(isExpectedYinyueResourceProbe({ avatar: true, loaded: false }), false,
  "Reload success requires the versioned spritesheet URL.");
assert.equal(isExpectedYinyueResourceProbe({ avatar: false, loaded: true }), false,
  "A matching URL in the wrong target cannot prove pet refresh.");

const [injector, install, restore, start, tray, sync] = await Promise.all([
  read("scripts/injector.mjs"),
  read("scripts/install-codex-cultivation.ps1"),
  read("scripts/restore-codex-cultivation.ps1"),
  read("scripts/start-codex-cultivation.ps1"),
  read("scripts/tray-codex-cultivation.ps1"),
  read("scripts/sync-codex-spirit-pet.ps1"),
]);

assert.match(injector, /const PET_REALM_POLL_MS = 2000;/,
  "Realm polling must be capped at once every two seconds.");
assert.match(injector, /window\.__CODEX_CULTIVATION_DEBUG__\?\.resolve\?\.\(\)\?\.id \?\? null/,
  "The real cultivation resolver must remain the realm source.");
assert.match(injector, /mainTargetIds\.has\(target\.id\)/,
  "Main shell target IDs must be excluded from pet reload.");
assert.match(injector, /Page\.reload", \{ ignoreCache: true \}/,
  "Eligible pet overlays must reload without cache.");
assert.match(injector, /waitForPetResource\(session, expectedFilename/,
  "Reload must verify the expected hashed spritesheet filename.");

assert.match(install, /\[switch\]\$NoSpiritPet/);
assert.match(install, /if \(\$NoSpiritPet\) \{[\s\S]*Write-CultivationUtf8FileAtomically -Path \$PetDisableFile/,
  "-NoSpiritPet must disable management without deleting an existing pet.");
assert.doesNotMatch(install, /\$PetManager remove/,
  "-NoSpiritPet installation must never remove an existing pet.");
assert.match(install, /\$PetManager install --family \$PetFamily/,
  "Default install must install Silver Moon.");
assert.match(restore, /\[switch\]\$KeepSpiritPet/);
assert.match(restore, /if \(-not \$KeepSpiritPet\)[\s\S]*\$PetManager remove/,
  "Default restore must remove only the managed Silver Moon files.");
assert.match(start, /--pet-family/);
assert.match(start, /--pet-disable-file/);
assert.match(sync, /--sync-pet/);
assert.match(tray, /重启 Codex 应用灵宠进阶/);
assert.match(tray, /-RestartForSpiritPet', '-PromptRestart/,
  "The tray restart path must preserve explicit user confirmation.");

console.log("PASS: Silver Moon CDP classification, reload verification, and PowerShell wiring are guarded.");
