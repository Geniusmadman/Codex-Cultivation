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

const [injector, controller, start, restore, menubar] = await Promise.all([
  read("scripts/injector.mjs"),
  read("scripts/cultivation-macos.mjs"),
  read("scripts/start-codex-cultivation.command"),
  read("scripts/restore-codex-cultivation.command"),
  read("scripts/menubar-codex-cultivation.swift"),
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

assert.match(controller, /--no-spirit-pet/);
assert.match(controller, /--keep-spirit-pet/);
assert.match(controller, /--restart-for-spirit-pet/);
assert.match(controller, /options\.noSpiritPet[\s\S]*petDisable/,
  "--no-spirit-pet must disable management without deleting an existing pet.");
assert.doesNotMatch(controller, /options\.noSpiritPet[\s\S]{0,400}removeSpiritPet/,
  "Disabling management during installation must never remove an existing pet.");
assert.match(controller, /installSpiritPet/,
  "Default installation must install Silver Moon.");
assert.match(controller, /if \(!options\.keepSpiritPet\)[\s\S]*removeSpiritPet/,
  "Default restore must remove only managed Silver Moon files.");
assert.match(controller, /--pet-family/);
assert.match(controller, /--pet-disable-file/);
assert.match(controller, /sync-pet/);
assert.match(menubar, /重启 Codex 应用灵宠进阶/);
assert.match(menubar, /restartForSpiritPet\(\)[\s\S]*let alert = NSAlert\(\)[\s\S]*guard alert\.runModal\(\) == \.alertFirstButtonReturn else \{ return \}[\s\S]*run\(\["start", "--restart-for-spirit-pet", "--restart-existing"\]/,
  "The menu bar pet restart path must obtain explicit confirmation before authorizing a restart.");
assert.match(start, /--prompt-restart/,
  "The normal launcher must keep restart confirmation enabled.");
assert.match(restore, /--prompt-restart/,
  "Restore must keep restart confirmation enabled.");

console.log("PASS: macOS Silver Moon CDP classification, reload verification, and controller wiring are guarded.");
