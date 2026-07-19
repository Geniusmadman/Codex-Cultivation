import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  classifyImageDimensions,
  readImageMetadata,
} from "../scripts/image-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(here, "..");
const featured = await fs.readFile(path.join(platformRoot, "assets", "cultivation-default.png"));
const helper = path.join(platformRoot, "scripts", "image-metadata.mjs");
const cultivationAssetRoot = path.join(platformRoot, "assets", "cultivation");

assert.deepEqual(readImageMetadata(featured, ".png"), {
  width: 2560,
  height: 1440,
  ratio: 2560 / 1440,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
});

const cli = spawnSync(process.execPath, [helper, "--check", path.join(platformRoot, "assets", "cultivation-default.png")], {
  encoding: "utf8",
});
assert.equal(cli.status, 0);
assert.deepEqual(JSON.parse(cli.stdout), readImageMetadata(featured, ".png"));

const generatedAssets = [
  "card-forge.png",
  "card-break-array.png",
  "card-retreat.png",
  "card-contemplate.png",
  "card-frame-forge.png",
  "card-frame-break-array.png",
  "card-frame-retreat.png",
  "card-frame-contemplate.png",
  "panel-frame.png",
  ...["female", "male"].flatMap((gender) =>
    ["qi", "foundation", "golden-core", "nascent-soul", "transformation"]
      .map((realm) => `companion-${gender}-${realm}.png`)),
];
for (const file of generatedAssets) {
  const bytes = await fs.readFile(path.join(cultivationAssetRoot, file));
  const metadata = readImageMetadata(bytes, ".png");
  assert.ok(metadata, `${file} must be a valid bounded PNG asset.`);
  assert.equal(
    metadata.aspect,
    file.startsWith("card-") && !file.startsWith("card-frame-") ? "square" : "portrait",
    `${file} should preserve its intended UI composition.`,
  );
}

for (const file of [
  "realm-orbit.png",
  "spirit-stone-lower.png",
  "spirit-stone-middle.png",
  "spirit-stone-upper.png",
  "spirit-stone-supreme.png",
]) {
  const metadata = readImageMetadata(await fs.readFile(path.join(cultivationAssetRoot, file)), ".png");
  assert.ok(metadata, `${file} must be a valid bounded PNG asset.`);
  assert.equal(metadata.aspect, "square", `${file} should remain square for compact HUD rendering.`);
}

const backgroundAssets = [
  "qi-refining-background.png",
  "qi-refining-background-light.png",
  "foundation-background.png",
  "foundation-background-light.png",
  "golden-core-background.png",
  "golden-core-background-light.png",
  "nascent-soul-background.png",
  "nascent-soul-background-light.png",
  "transformation-background.png",
  "transformation-background-light.png",
];
assert.equal(backgroundAssets.length, 10, "Five realms must each include dark and light artwork.");
for (const file of backgroundAssets) {
  const metadata = readImageMetadata(await fs.readFile(path.join(cultivationAssetRoot, file)), ".png");
  assert.ok(metadata, `${file} must be a valid bounded PNG asset.`);
  assert.equal(metadata.aspect, "wide", `${file} must preserve the wide desktop composition.`);
  assert.ok(metadata.ratio >= 1.7, `${file} must retain a 16:9-class background ratio.`);
}

const heroSigil = readImageMetadata(
  await fs.readFile(path.join(cultivationAssetRoot, "hero-sigil.png")),
  ".png",
);
assert.ok(heroSigil, "hero-sigil.png must be a valid bounded PNG asset.");
assert.equal(heroSigil.aspect, "wide", "hero-sigil.png should preserve its wide hero composition.");

assert.deepEqual(classifyImageDimensions({ width: 800, height: 1200 }), {
  width: 800,
  height: 1200,
  ratio: 800 / 1200,
  wide: false,
  aspect: "portrait",
  taskMode: "ambient",
});
assert.equal(MAX_IMAGE_DIMENSION, 16384);
assert.equal(MAX_IMAGE_PIXELS, 50_000_000);
assert.equal(classifyImageDimensions({ width: 10000, height: 6000 }), null);
assert.equal(classifyImageDimensions({ width: 20000, height: 1 }), null);
assert.equal(classifyImageDimensions({ width: 2560.5, height: 1440 }), null);

const oversizedPngHeader = Buffer.alloc(24);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversizedPngHeader);
oversizedPngHeader.writeUInt32BE(13, 8);
oversizedPngHeader.write("IHDR", 12, "ascii");
oversizedPngHeader.writeUInt32BE(10000, 16);
oversizedPngHeader.writeUInt32BE(6000, 20);
assert.equal(readImageMetadata(oversizedPngHeader, ".png"), null);

const malformedJpeg = Buffer.from(featured.subarray(0, 64));
malformedJpeg[0] = 0;
assert.equal(readImageMetadata(malformedJpeg, ".jpg"), null);

console.log("PASS: macOS injector reads strict image dimensions before building the payload.");
