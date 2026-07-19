import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(platformRoot, "assets", "renderer-inject.js"), "utf8");
const cultivationCss = await fs.readFile(path.join(platformRoot, "assets", "cultivation-skin.css"), "utf8");
const buildPayload = (config = {}, cultivationArts = {}) => template
  .replace("__DREAM_CSS_JSON__", JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
  .replace("__CULTIVATION_ARTS_JSON__", JSON.stringify(cultivationArts))
  .replace("__DREAM_THEME_JSON__", JSON.stringify(config));
const payload = buildPayload();

function createFixture({
  shellPresent,
  staleSkin = false,
  homePresent = false,
  utilityPresent = false,
  shellAppearance = "dark",
  computedColorScheme = "",
  osAppearance = "light",
  analysisFixture = null,
}) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-cultivation"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-art", "url(\"blob:stale\")"]] : []);
  const revokedUrls = [];
  const observers = [];
  let objectUrlCount = 0;
  let hasShell = shellPresent;
  let root;

  const queueRootClassMutation = () => {
    for (const observer of observers) {
      if (observer.target !== root || !observer.options?.attributes) continue;
      if (observer.options.attributeFilter && !observer.options.attributeFilter.includes("class")) continue;
      observer.records.push({ type: "attributes", attributeName: "class", target: root });
    }
  };
  const makeClassList = (classes = new Set(), onMutation = () => {}) => ({
    add(...values) {
      let changed = false;
      for (const value of values) {
        if (!classes.has(value)) { classes.add(value); changed = true; }
      }
      if (changed) onMutation();
    },
    remove(...values) {
      let changed = false;
      for (const value of values) changed = classes.delete(value) || changed;
      if (changed) onMutation();
    },
    toggle(value, enabled) {
      const changed = enabled ? !classes.has(value) : classes.has(value);
      if (enabled) classes.add(value);
      else classes.delete(value);
      if (changed) onMutation();
    },
    contains(value) { return classes.has(value); },
  });

  root = {
    className: shellAppearance,
    classList: makeClassList(rootClasses, queueRootClassMutation),
    getAttribute() { return null; },
    style: {
      setProperty(key, value) { rootStyles.set(key, value); },
      removeProperty(key) { rootStyles.delete(key); },
    },
    appendChild(node) {
      node.parentElement = root;
      nodes.set(node.id, node);
    },
  };
  const body = {
    className: "",
    getAttribute() { return null; },
    appendChild(node) {
      node.parentElement = body;
      nodes.set(node.id, node);
    },
  };
  const shellMain = {
    classList: makeClassList(),
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const routeClasses = new Set();
  const utilityClasses = new Set();
  const utilityNode = { classList: makeClassList(utilityClasses) };
  const routeChildren = [];
  const routeMain = {
    classList: makeClassList(routeClasses),
    children: routeChildren,
    appendChild(node) {
      node.parentElement = routeMain;
      routeChildren.push(node);
      if (node.id) nodes.set(node.id, node);
    },
    querySelectorAll(selector) {
      if (selector === '[class*="_homeUtilityBar_"]' && utilityPresent) return [utilityNode];
      return [];
    },
  };
  const staleHome = { classList: makeClassList(new Set(["dream-home"])) };
  const staleShell = { classList: makeClassList(new Set(["dream-home-shell"])) };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    return {
      id: "",
      dataset: {},
      style: {},
      classList: makeClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      remove() { nodes.delete(this.id); },
    };
  };
  if (staleSkin) {
    const style = createElement();
    style.id = "codex-cultivation-style";
    nodes.set(style.id, style);
    const chrome = createElement();
    chrome.id = "codex-cultivation-chrome";
    nodes.set(chrome.id, chrome);
  }

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface") return hasShell ? shellMain : null;
      if (selector === "aside.app-shell-left-panel") return hasShell ? {} : null;
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && homePresent ? routeMain : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="main"]') return hasShell ? [routeMain] : [];
      if (selector === ".dream-task") return routeClasses.has("dream-task") ? [routeMain] : [];
      if (selector === ".dream-home-utility") {
        return utilityClasses.has("dream-home-utility") ? [utilityNode] : [];
      }
      if (!staleSkin) return [];
      if (selector === ".dream-home") return [staleHome];
      if (selector === ".dream-home-shell") return [staleShell];
      return [];
    },
  };
  const context = {
    window: {
      matchMedia() { return { matches: osAppearance === "dark" }; },
    },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        this.target = null;
        this.options = null;
        observers.push(this);
      }
      observe(target, options = {}) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.target = null;
        this.records = [];
      }
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    },
    URL: {
      createObjectURL() { objectUrlCount += 1; return `blob:fixture-${objectUrlCount}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
    getComputedStyle() { return { colorScheme: computedColorScheme }; },
  };
  if (analysisFixture) {
    context.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }

  return {
    context,
    nodes,
    observers,
    rootClasses,
    rootStyles,
    revokedUrls,
    routeClasses,
    utilityClasses,
    setShellPresent(value) { hasShell = value; },
  };
}

const main = createFixture({ shellPresent: true });
const mainResult = vm.runInNewContext(payload, main.context);
assert.equal(mainResult.installed, true);
assert.equal(main.rootClasses.has("codex-cultivation"), true);
assert.equal(main.rootStyles.get("--dream-art"), 'url("blob:fixture-1")');
assert.equal(main.nodes.has("codex-cultivation-style"), true);
assert.equal(main.nodes.has("codex-cultivation-chrome"), true);
assert.equal(main.rootClasses.has("dream-theme-dark"), true);
assert.equal(main.rootClasses.has("dream-art-standard"), true);
assert.equal(main.rootClasses.has("dream-task-ambient"), true);
assert.equal(main.routeClasses.has("dream-task"), true);
assert.equal(main.context.window.__CODEX_CULTIVATION_STATE__.cleanup(), true);
assert.equal(main.rootClasses.has("codex-cultivation"), false);
assert.equal(main.rootClasses.has("dream-theme-dark"), false);
assert.equal(main.nodes.has("codex-cultivation-style"), false);
assert.equal(main.nodes.has("codex-cultivation-chrome"), false);
assert.deepEqual(main.revokedUrls, ["blob:fixture-1"]);

const reinjected = createFixture({ shellPresent: true });
vm.runInNewContext(payload, reinjected.context);
const firstState = reinjected.context.window.__CODEX_CULTIVATION_STATE__;
vm.runInNewContext(payload, reinjected.context);
const secondState = reinjected.context.window.__CODEX_CULTIVATION_STATE__;
assert.notEqual(secondState.installToken, firstState.installToken);
assert.equal(secondState.artUrl, "blob:fixture-2");
assert.equal(reinjected.rootStyles.get("--dream-art"), 'url("blob:fixture-2")');
assert.deepEqual(reinjected.revokedUrls, ["blob:fixture-1"]);
assert.equal(firstState.cleanup(), false);
assert.equal(secondState.cleanup(), true);

const auxiliary = createFixture({ shellPresent: false, staleSkin: true });
const auxiliaryResult = vm.runInNewContext(payload, auxiliary.context);
assert.equal(auxiliaryResult.installed, true);
assert.equal(auxiliary.rootClasses.has("codex-cultivation"), false);
assert.equal(auxiliary.rootStyles.has("--dream-art"), false);
assert.equal(auxiliary.nodes.has("codex-cultivation-style"), false);
assert.equal(auxiliary.nodes.has("codex-cultivation-chrome"), false);

auxiliary.setShellPresent(true);
auxiliary.context.window.__CODEX_CULTIVATION_STATE__.ensure();
assert.equal(auxiliary.rootClasses.has("codex-cultivation"), true);
assert.equal(auxiliary.nodes.has("codex-cultivation-style"), true);
assert.equal(auxiliary.nodes.has("codex-cultivation-chrome"), true);

const configured = createFixture({
  shellPresent: true,
  homePresent: true,
  utilityPresent: true,
});
const configuredPayload = buildPayload({
  appearance: "light",
  palette: { accent: "#d45a70" },
  art: { focusX: .15, focusY: .8, safeArea: "right", taskMode: "off" },
});
const configuredResult = vm.runInNewContext(configuredPayload, configured.context);
assert.equal(configuredResult.adaptive, true);
assert.equal(configured.rootClasses.has("dream-theme-light"), true);
assert.equal(configured.rootClasses.has("dream-theme-dark"), false);
assert.equal(configured.rootClasses.has("dream-focus-left"), true);
assert.equal(configured.rootClasses.has("dream-safe-right"), true);
assert.equal(configured.rootClasses.has("dream-task-off"), true);
assert.equal(configured.rootStyles.get("--dream-art-position"), "15% 80%");
assert.equal(configured.rootStyles.get("--dream-accent"), "#d45a70");
assert.equal(configured.routeClasses.has("dream-home"), true);
assert.equal(configured.routeClasses.has("dream-task"), false);
assert.equal(configured.utilityClasses.has("dream-home-utility"), true);
assert.equal(configured.nodes.has("codex-cultivation-left-rail"), true);
assert.equal(configured.nodes.has("codex-cultivation-right-rail"), true);
const companionMarkup = configured.nodes.get("codex-cultivation-left-rail").innerHTML;
assert.match(companionMarkup, /cultivation-companion-quote/);
assert.match(companionMarkup, /今日灵台清明/);
assert.doesNotMatch(companionMarkup, /随境换装|仙侍辅修|静候差遣/);
assert.match(companionMarkup, /cultivation-realm-dial/);
assert.match(companionMarkup, /<canvas class="cultivation-realm-dial__flow"/);
assert.doesNotMatch(companionMarkup, /data-realm-wisp=/);
assert.match(template, /const drawStream = \(stream, phase, width, height\) =>/);
assert.match(template, /const samples = 52;/);
assert.match(template, /const trailSpan = Math\.PI \* \.78;/);
assert.match(template, /phase - stream\.direction \* trailSpan \* index/);
assert.match(template, /globalCompositeOperation = "lighter"/);
assert.equal((template.match(/direction: 1,/g) || []).length, 2);
assert.equal((template.match(/direction: -1,/g) || []).length, 2);
assert.match(cultivationCss, /:root\.dream-theme-light \.cultivation-current-method/);
assert.match(cultivationCss, /:root\.dream-theme-light \.cultivation-status-flow/);
assert.match(cultivationCss, /:root\.dream-theme-light \.dream-home \.group\\\/home-suggestions button/);
assert.match(cultivationCss, /\.cultivation-home-fallback-cards/);
assert.match(template, /const CULTIVATION_HOME_CARDS_ID = "codex-cultivation-home-cards"/);
assert.match(template, /nativeSuggestionButtons\.length/);
assert.match(template, /data-cultivation-fallback-card/);
assert.match(template, /const seedCultivationPrompt = \(kind\) =>/);
assert.match(companionMarkup, /cultivation-stone-ledger/);
assert.match(companionMarkup, /cultivation-current-method/);
assert.match(template, /cultivation-gender-control/);
assert.doesNotMatch(template, /仙侍形象|只切换人物身份/);
assert.match(template, /<h1>今日问道<\/h1>/);
assert.match(template, /以代码为剑，以逻辑炼心；一问破境，万法归真。/);
assert.match(
  template,
  /const cultivationDialogMarkup = \(state, realm\) => \{[\s\S]*?const maxDay = Math\.max\(1, \.\.\.recent\.map\(\(item\) => item\.tokens\)\);/,
  "The cultivation dialog must compute its own seven-day chart scale before rendering.",
);
assert.equal(configured.context.window.__CODEX_CULTIVATION_STATE__.cleanup(), true);
assert.equal(configured.utilityClasses.has("dream-home-utility"), false);

const analysisPixels = new Uint8ClampedArray(48 * 12 * 4);
for (let index = 0; index < 48 * 12; index += 1) {
  const offset = index * 4;
  const x = index % 48;
  const subject = x >= 34 && x <= 42;
  analysisPixels[offset] = subject ? 210 : 246;
  analysisPixels[offset + 1] = subject ? 84 : 239;
  analysisPixels[offset + 2] = subject ? 112 : 237;
  analysisPixels[offset + 3] = 255;
}
const analyzed = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1200, naturalHeight: 400, pixels: analysisPixels },
});
vm.runInNewContext(payload, analyzed.context);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(analyzed.rootClasses.has("dream-theme-dark"), true);
assert.equal(analyzed.rootClasses.has("dream-theme-light"), false);
assert.equal(analyzed.rootClasses.has("dream-art-wide"), true);
assert.equal(analyzed.rootClasses.has("dream-task-banner"), true);
assert.equal(analyzed.rootClasses.has("dream-safe-left"), true);
assert.notEqual(analyzed.rootStyles.get("--dream-accent"), "rgb(216 104 119)");

const standardArt = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 800, naturalHeight: 800, pixels: analysisPixels },
});
vm.runInNewContext(payload, standardArt.context);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(standardArt.rootClasses.has("dream-art-standard"), true);
assert.equal(standardArt.rootClasses.has("dream-task-ambient"), true);
assert.equal(standardArt.rootClasses.has("dream-task-banner"), false);

const mediumWide = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 2100, naturalHeight: 1000, pixels: analysisPixels },
});
vm.runInNewContext(payload, mediumWide.context);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(mediumWide.rootClasses.has("dream-art-wide"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-ambient"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-banner"), false);

const nativeLight = createFixture({ shellPresent: true, shellAppearance: "light" });
vm.runInNewContext(payload, nativeLight.context);
assert.equal(nativeLight.rootClasses.has("dream-theme-light"), true);
assert.equal(nativeLight.rootClasses.has("dream-theme-dark"), false);

const dualArtLight = createFixture({ shellPresent: true, shellAppearance: "light" });
vm.runInNewContext(buildPayload({}, {
  qi: "data:image/png;base64,AA==",
  qiLight: "data:image/png;base64,AA==",
}), dualArtLight.context);
assert.equal(dualArtLight.rootStyles.get("--dream-art"), 'url("blob:fixture-3")');

const nativeComputedDark = createFixture({
  shellPresent: true,
  shellAppearance: "",
  computedColorScheme: "dark",
  osAppearance: "light",
});
vm.runInNewContext(payload, nativeComputedDark.context);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-light"), false);
nativeComputedDark.context.window.__CODEX_CULTIVATION_STATE__.ensure();
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
const nativeObserver = nativeComputedDark.observers[0];
nativeObserver.takeRecords();
nativeComputedDark.context.window.__CODEX_CULTIVATION_STATE__.ensure();
assert.equal(nativeObserver.takeRecords().length, 0,
  "Sampling the native computed color-scheme must not queue a self-triggering root mutation pass.");

const metadataWide = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ artMetadata: { ratio: 16 / 9 } }), metadataWide.context);
assert.equal(metadataWide.rootClasses.has("dream-art-wide"), true);
assert.equal(metadataWide.rootClasses.has("dream-art-standard"), false);

const cultivationEngine = createFixture({ shellPresent: true });
vm.runInNewContext(payload, cultivationEngine.context);
const cultivationDebug = cultivationEngine.context.window.__CODEX_CULTIVATION_DEBUG__;
assert.ok(cultivationDebug, "Cultivation debug API should expose the pure state transitions for verification.");

const modelMethods = [
  ["GPT 5.4 mini", "灵犀轻云诀"],
  ["GPT-5.5", "紫府通玄经"],
  ["GPT 5.6 Luna", "月华流光诀"],
  ["GPT-5.6 Terra", "地脉归元经"],
  ["GPT 5.6 Sol\n中", "大日天衍经"],
];
for (const [model, method] of modelMethods) {
  assert.equal(cultivationDebug.methodForModel(model).method, method, `${model} should select ${method}.`);
}
assert.equal(cultivationDebug.methodForModel("Unknown Model").method, "清心诀");
assert.equal(cultivationDebug.stoneDetails(12_480_000_000).grade, "supreme");
assert.equal(cultivationDebug.stoneDetails(125_430_000).grade, "upper");
assert.equal(cultivationDebug.stoneDetails(48_672_000).grade, "middle");
assert.equal(cultivationDebug.stoneDetails(1_248_000).grade, "middle");
assert.equal(cultivationDebug.stoneDetails(12_480).grade, "lower");

let cultivation = cultivationDebug.setState({
  schemaVersion: 2,
  totalTokens: 0,
  cultivationTokens: 0,
  realmIndex: 0,
});
assert.equal(cultivation.schemaVersion, 4);
assert.equal(cultivation.settings.companionGender, "female");
cultivation = cultivationDebug.setState({
  schemaVersion: 3,
  settings: { companionGender: "male" },
});
assert.equal(cultivation.settings.companionGender, "male");
cultivation = cultivationDebug.setState({
  schemaVersion: 2,
  settings: { companionGender: "unexpected" },
});
assert.equal(cultivation.settings.companionGender, "female");
cultivation = cultivationDebug.setState({
  schemaVersion: 3,
  totalTokens: 0,
  cultivationTokens: 0,
  realmIndex: 0,
});
cultivation = cultivationDebug.addTokens(500_000_000);
assert.equal(cultivation.realmIndex, 0, "Reaching 500M must not skip the Foundation tribulation.");
assert.equal(cultivation.cultivationTokens, 500_000_000);
assert.equal(cultivation.tribulation.destination, "筑基");

cultivationDebug.setState({
  schemaVersion: 2,
  totalTokens: 15_000_000,
  cultivationTokens: 15_000_000,
  realmIndex: 0,
});
cultivationDebug.grantEnlightenment();
cultivation = cultivationDebug.claimEnlightenment();
assert.equal(cultivation.cultivationTokens, 30_000_000);
assert.equal(cultivation.tribulation, null, "A normal enlightenment should advance only one minor stage.");

cultivationDebug.setState({
  schemaVersion: 2,
  totalTokens: 300_000_000,
  cultivationTokens: 300_000_000,
  realmIndex: 0,
});
cultivationDebug.grantEnlightenment();
cultivation = cultivationDebug.claimEnlightenment();
assert.equal(cultivation.cultivationTokens, 500_000_000);
assert.equal(cultivation.realmIndex, 0);
assert.equal(cultivation.tribulation.destination, "筑基",
  "An enlightenment at a major boundary must fill cultivation and start tribulation instead of promoting.");

const today = new Date().toLocaleDateString("en-CA");
const dateAt = (offset) => {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-CA");
};
cultivationDebug.setState({
  schemaVersion: 2,
  totalTokens: 500_000_000,
  cultivationTokens: 500_000_000,
  realmIndex: 0,
  daily: { [dateAt(-2)]: 1000, [dateAt(-1)]: 1000, [today]: 1000 },
  tribulation: { status: "active", startedDay: dateAt(-2), targetTokens: 1000, destination: "筑基" },
});
cultivation = cultivationDebug.settle(today);
assert.equal(cultivation.realmIndex, 1);
assert.equal(cultivation.tribulation, null);
assert.equal(cultivation.cultivationTokens, 500_000_000);

cultivationDebug.setState({
  schemaVersion: 2,
  totalTokens: 500_000_000,
  cultivationTokens: 500_000_000,
  realmIndex: 0,
  daily: { [dateAt(-1)]: 0, [today]: 1000 },
  tribulation: { status: "active", startedDay: dateAt(-1), targetTokens: 1000, destination: "筑基" },
});
cultivation = cultivationDebug.settle(today);
assert.equal(cultivation.realmIndex, 0);
assert.equal(cultivation.tribulation, null);
assert.equal(cultivation.cultivationTokens, 440_000_000,
  "A missed tribulation day should remove 12% of the current realm span.");

console.log("PASS: renderer applies adaptive theme metadata and preserves transparent auxiliary windows.");
