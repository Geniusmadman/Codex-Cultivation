import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsRoot = path.dirname(scriptPath);
const platformRoot = path.resolve(scriptsRoot, "..");
const injectorPath = path.join(scriptsRoot, "injector.mjs");
const defaultAppPath = "/Applications/ChatGPT.app";
const expectedBundleId = "com.openai.codex";
const expectedTeamId = "2DC432GLL2";
const defaultStateRoot = path.join(os.homedir(), "Library", "Application Support", "CodexCultivation");
const maxImageBytes = 16 * 1024 * 1024;

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    command,
    port: 9335,
    portExplicit: false,
    appPath: defaultAppPath,
    stateRoot: defaultStateRoot,
    profilePath: null,
    screenshot: null,
    restartExisting: false,
    promptRestart: false,
    force: false,
    noRelaunch: false,
    foreground: false,
    imagePath: null,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--port") {
      options.port = Number(rest[++index]);
      options.portExplicit = true;
    } else if (arg === "--app") options.appPath = path.resolve(rest[++index]);
    else if (arg === "--state-root") options.stateRoot = path.resolve(rest[++index]);
    else if (arg === "--profile") options.profilePath = path.resolve(rest[++index]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(rest[++index]);
    else if (arg === "--restart-existing") options.restartExisting = true;
    else if (arg === "--prompt-restart") options.promptRestart = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--no-relaunch") options.noRelaunch = true;
    else if (arg === "--foreground") options.foreground = true;
    else if (arg === "--image") options.imagePath = path.resolve(rest[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Port must be between 1024 and 65535: ${options.port}`);
  }
  return options;
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(`${file} failed: ${detail}`);
  }
  return result;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pathExists(candidate) {
  try {
    await fs.lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoSymlinkComponents(candidate, stopAt = os.homedir()) {
  let current = path.resolve(candidate);
  const boundary = path.resolve(stopAt);
  while (current.startsWith(`${boundary}${path.sep}`) || current === boundary) {
    if (await pathExists(current)) {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Managed path contains a symbolic link: ${current}`);
    }
    if (current === boundary) return;
    current = path.dirname(current);
  }
  throw new Error(`Managed path must remain under ${boundary}: ${candidate}`);
}

async function ensureManagedDirectory(directory, stateRoot) {
  const resolved = path.resolve(directory);
  const root = path.resolve(stateRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Managed path escaped its state root: ${resolved}`);
  }
  await assertNoSymlinkComponents(resolved);
  await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
  await assertNoSymlinkComponents(resolved);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error(`Managed path is not a directory: ${resolved}`);
}

async function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
  }
}

function statePaths(stateRoot) {
  return {
    root: stateRoot,
    activeTheme: path.join(stateRoot, "active-theme"),
    savedThemes: path.join(stateRoot, "themes"),
    images: path.join(stateRoot, "images"),
    state: path.join(stateRoot, "state.json"),
    pause: path.join(stateRoot, "paused"),
    lock: path.join(stateRoot, "operation.lock"),
    stdout: path.join(stateRoot, "injector.log"),
    stderr: path.join(stateRoot, "injector-error.log"),
    verify: path.join(stateRoot, "verify.log"),
  };
}

async function acquireLock(paths) {
  await ensureManagedDirectory(paths.root, paths.root);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(paths.lock, { mode: 0o700 });
      await fs.writeFile(path.join(paths.lock, "pid"), `${process.pid}\n`, { mode: 0o600 });
      return async () => fs.rm(paths.lock, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stat = await fs.lstat(paths.lock);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Operation lock is not a safe directory: ${paths.lock}`);
      }
      const savedPid = Number((await fs.readFile(path.join(paths.lock, "pid"), "utf8").catch(() => "")).trim());
      if (attempt === 0 && Number.isInteger(savedPid) && savedPid > 1 && !processCommand(savedPid)) {
        await fs.rm(paths.lock, { recursive: true, force: true });
        continue;
      }
      throw new Error("Another Codex Cultivation install, start, restore, or verify operation is running.");
    }
  }
  throw new Error("The Codex Cultivation operation lock could not be acquired.");
}

async function validateImage(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported image format: ${extension || "missing"}`);
  }
  const stat = await fs.stat(imagePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > maxImageBytes) {
    throw new Error("Theme image must be a non-empty file no larger than 16 MB.");
  }
  const bytes = await fs.readFile(imagePath);
  if (!readImageMetadata(bytes, extension)) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit.");
  }
}

async function initializeThemeStore(paths) {
  for (const directory of [paths.root, paths.activeTheme, paths.savedThemes, paths.images]) {
    await ensureManagedDirectory(directory, paths.root);
  }
  const sourceImage = path.join(platformRoot, "assets", "cultivation-default.png");
  const sourceTheme = path.join(platformRoot, "assets", "theme.json");
  await validateImage(sourceImage);
  const activeThemeFile = path.join(paths.activeTheme, "theme.json");
  if (!await pathExists(activeThemeFile)) {
    await fs.copyFile(sourceImage, path.join(paths.activeTheme, "cultivation-default.png"));
    await fs.copyFile(sourceTheme, activeThemeFile);
  }
  const archivedDefault = path.join(paths.images, "cultivation-default.png");
  if (!await pathExists(archivedDefault)) await fs.copyFile(sourceImage, archivedDefault);
  await validateThemeDirectory(paths.activeTheme);
}

async function validateThemeDirectory(directory) {
  const themePath = path.join(directory, "theme.json");
  const theme = await readJson(themePath);
  if (!theme || typeof theme !== "object" || Array.isArray(theme) || typeof theme.image !== "string") {
    throw new Error(`Theme metadata must contain a relative image path: ${themePath}`);
  }
  if (path.isAbsolute(theme.image)) throw new Error("Theme image path must be relative.");
  const imagePath = path.resolve(directory, theme.image);
  if (!imagePath.startsWith(`${path.resolve(directory)}${path.sep}`)) {
    throw new Error("Theme image escaped its theme directory.");
  }
  await assertNoSymlinkComponents(imagePath);
  await validateImage(imagePath);
  return { theme, imagePath };
}

async function importThemeImage(paths, imagePath) {
  await initializeThemeStore(paths);
  const source = path.resolve(imagePath);
  await validateImage(source);
  const extension = path.extname(source).toLowerCase();
  const fileName = `art-${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`;
  const target = path.join(paths.activeTheme, fileName);
  const current = await validateThemeDirectory(paths.activeTheme);
  await fs.copyFile(source, target);
  await validateImage(target);
  const nextTheme = { ...current.theme, id: "custom", name: "自定义主题", image: fileName };
  await writeJsonAtomic(path.join(paths.activeTheme, "theme.json"), nextTheme);
  if (current.imagePath !== target && path.dirname(current.imagePath) === paths.activeTheme) {
    await fs.rm(current.imagePath, { force: true });
  }
  await fs.copyFile(target, path.join(paths.images, fileName));
  return nextTheme;
}

function plistValue(appPath, key) {
  return run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", path.join(appPath, "Contents", "Info.plist")]).stdout.trim();
}

function validateCodexApp(appPath) {
  const resolved = fsSync.realpathSync(appPath);
  if (resolved !== defaultAppPath) throw new Error(`Codex must be the official app at ${defaultAppPath}; found ${resolved}`);
  const bundleId = plistValue(resolved, "CFBundleIdentifier");
  const version = plistValue(resolved, "CFBundleShortVersionString");
  const executableName = plistValue(resolved, "CFBundleExecutable");
  const executable = path.join(resolved, "Contents", "MacOS", executableName);
  if (bundleId !== expectedBundleId || !fsSync.existsSync(executable)) {
    throw new Error("The official Codex app identity could not be validated.");
  }
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", resolved]);
  const signature = run("/usr/bin/codesign", ["-dv", "--verbose=4", resolved], { allowFailure: true });
  const signatureText = `${signature.stdout}\n${signature.stderr}`;
  const teamId = signatureText.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  const identifier = signatureText.match(/^Identifier=(.+)$/m)?.[1]?.trim();
  if (teamId !== expectedTeamId || identifier !== expectedBundleId) {
    throw new Error(`Unexpected Codex signature identity: ${identifier ?? "unknown"} / ${teamId ?? "unknown"}`);
  }
  return { appPath: resolved, executable, bundleId, version, teamId };
}

function processTable() {
  const output = run("/bin/ps", ["-axo", "pid=,ppid=,command="]).stdout;
  return output.split("\n").map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
  }).filter(Boolean);
}

function codexMainProcesses(codex) {
  return processTable().filter((item) => item.command === codex.executable || item.command.startsWith(`${codex.executable} `));
}

function listenerPids(port) {
  const result = run("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { allowFailure: true });
  if (![0, 1].includes(result.status)) throw new Error(`lsof failed while inspecting port ${port}`);
  return [...new Set(result.stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))];
}

function codexOwnsPort(port, codex) {
  const listeners = listenerPids(port);
  if (!listeners.length) return false;
  const table = processTable();
  const byPid = new Map(table.map((item) => [item.pid, item]));
  const codexPids = new Set(table.filter((item) =>
    item.command === codex.executable || item.command.startsWith(`${codex.executable} `),
  ).map((item) => item.pid));
  const belongsToCodexTree = (pid) => {
    const visited = new Set();
    let current = pid;
    while (current > 1 && !visited.has(current)) {
      if (codexPids.has(current)) return true;
      visited.add(current);
      current = byPid.get(current)?.ppid ?? 0;
    }
    return false;
  };
  return listeners.every(belongsToCodexTree);
}

function codexRootsForPort(port, codex) {
  const listeners = listenerPids(port);
  if (!listeners.length) return [];
  const table = processTable();
  const byPid = new Map(table.map((item) => [item.pid, item]));
  const codexPids = new Set(table.filter((item) =>
    item.command === codex.executable || item.command.startsWith(`${codex.executable} `),
  ).map((item) => item.pid));
  const roots = new Set();
  for (const listener of listeners) {
    const visited = new Set();
    let current = listener;
    let root = null;
    while (current > 1 && !visited.has(current)) {
      if (codexPids.has(current)) {
        root = current;
        break;
      }
      visited.add(current);
      current = byPid.get(current)?.ppid ?? 0;
    }
    if (!root) return [];
    roots.add(root);
  }
  return [...roots];
}

async function portAvailable(port) {
  if (listenerPids(port).length) return false;
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => error?.code === "EADDRINUSE" ? resolve(false) : reject(error));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

async function selectPort(preferred) {
  for (let port = preferred; port < Math.min(preferred + 100, 65536); port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(`No available loopback port found from ${preferred} through ${preferred + 99}.`);
}

function validateLoopbackWebSocket(value, port, kind) {
  const url = new URL(value);
  const expected = new RegExp(`^/devtools/${kind}/[A-Za-z0-9._-]{1,200}$`);
  if (url.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) ||
      Number(url.port) !== port || url.username || url.password || url.search || url.hash || !expected.test(url.pathname)) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback endpoint shape.");
  }
  return url;
}

async function fetchJson(port, resource) {
  const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
    redirect: "error",
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
  return await response.json();
}

async function cdpIdentity(port, codex) {
  if (!codexOwnsPort(port, codex)) return null;
  try {
    const version = await fetchJson(port, "/json/version");
    const browserUrl = validateLoopbackWebSocket(version.webSocketDebuggerUrl, port, "browser");
    const browserId = browserUrl.pathname.split("/").at(-1);
    const targets = await fetchJson(port, "/json/list");
    const appTargets = Array.isArray(targets) ? targets.filter((target) => {
      if (target?.type !== "page" || typeof target.id !== "string" || !target.url?.startsWith("app://")) return false;
      try {
        const url = validateLoopbackWebSocket(target.webSocketDebuggerUrl, port, "page");
        return url.pathname === `/devtools/page/${target.id}`;
      } catch {
        return false;
      }
    }) : [];
    if (!appTargets.length || !codexOwnsPort(port, codex)) return null;
    return { browserId, browser: version.Browser ?? null, targetCount: appTargets.length };
  } catch {
    return null;
  }
}

async function waitForIdentity(port, codex, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const identity = await cdpIdentity(port, codex);
    if (identity) return identity;
    await sleep(400);
  }
  throw new Error(`Codex did not expose a verified loopback CDP endpoint on port ${port}.`);
}

async function promptRestart(message) {
  const script = `tell application "Finder" to display dialog ${JSON.stringify(message)} with title "Codex Cultivation" buttons {"取消", "重新启动"} default button "重新启动" cancel button "取消" with icon caution`;
  const result = run("/usr/bin/osascript", [
    "-e", "tell application \"Finder\" to activate",
    "-e", script,
  ], { allowFailure: true });
  return result.status === 0;
}

async function stopCodex(codex, force = false) {
  const before = codexMainProcesses(codex);
  if (!before.length) return;
  run("/usr/bin/osascript", ["-e", `tell application id "${codex.bundleId}" to quit`], { allowFailure: true });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && codexMainProcesses(codex).length) await sleep(250);
  const remaining = codexMainProcesses(codex);
  if (!remaining.length) return;
  if (!force) throw new Error("Codex did not close cleanly. Close it manually or use --force after saving work.");
  for (const item of remaining) process.kill(item.pid, "SIGTERM");
  await sleep(1200);
  for (const item of codexMainProcesses(codex)) process.kill(item.pid, "SIGKILL");
}

async function stopCodexPortSession(port, codex, force = false) {
  const roots = codexRootsForPort(port, codex);
  if (!roots.length) throw new Error(`No validated Codex process tree owns port ${port}.`);
  for (const pid of roots) process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && roots.some((pid) => processCommand(pid))) await sleep(250);
  const remaining = roots.filter((pid) => processCommand(pid));
  if (!remaining.length) return;
  if (!force) throw new Error("The Codex debugging session did not close cleanly. Retry with --force after saving work.");
  for (const pid of remaining) process.kill(pid, "SIGKILL");
}

function launchCodex(codex, port = null, profilePath = null) {
  const args = ["-na", codex.appPath];
  if (port !== null) {
    args.push("--args", "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`);
    if (profilePath) args.push(`--user-data-dir=${profilePath}`);
  }
  run("/usr/bin/open", args);
}

function processStartToken(pid) {
  const result = run("/bin/ps", ["-p", String(pid), "-o", "lstart="], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function processCommand(pid) {
  const result = run("/bin/ps", ["-p", String(pid), "-o", "command="], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function stopRecordedInjector(state) {
  if (!state?.injectorPid) return true;
  const command = processCommand(Number(state.injectorPid));
  if (!command) return true;
  const expectedParts = [state.nodePath, state.injectorPath, "--watch", "--port", String(state.port), state.browserId];
  if (state.injectorStartedAt !== processStartToken(Number(state.injectorPid)) ||
      expectedParts.some((part) => !part || !command.includes(String(part)))) {
    throw new Error("Saved injector PID no longer matches its recorded process identity; state was preserved.");
  }
  process.kill(Number(state.injectorPid), "SIGTERM");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && processCommand(Number(state.injectorPid))) await sleep(150);
  return !processCommand(Number(state.injectorPid));
}

async function runInjector(args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [injectorPath, ...args], {
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function start(options, paths) {
  await initializeThemeStore(paths);
  const codex = validateCodexApp(options.appPath);
  const previousState = await readJson(paths.state);
  if (!options.portExplicit && previousState?.port) options.port = Number(previousState.port);
  let identity = await cdpIdentity(options.port, codex);
  const running = codexMainProcesses(codex);
  if (!identity && running.length && !options.profilePath) {
    let authorized = options.restartExisting;
    if (!authorized && options.promptRestart) {
      authorized = await promptRestart("Codex 需要重新启动一次以启用修仙界面。未发送的输入可能丢失，是否继续？");
    }
    if (!authorized) throw new Error("Codex is open without the Cultivation CDP endpoint. Close it or use --restart-existing.");
    await stopCodex(codex, options.force);
  }
  let launchedWithCdp = false;
  if (!identity) {
    if (!await portAvailable(options.port)) {
      if (options.portExplicit) throw new Error(`Port ${options.port} is occupied by an unverified listener.`);
      options.port = await selectPort(options.port);
    }
    if (options.profilePath) await fs.mkdir(options.profilePath, { recursive: true, mode: 0o700 });
    launchCodex(codex, options.port, options.profilePath);
    launchedWithCdp = true;
    identity = await waitForIdentity(options.port, codex);
  }
  if (previousState) await stopRecordedInjector(previousState);
  await fs.rm(paths.pause, { force: true });
  const injectorArgs = ["--watch", "--port", String(options.port), "--browser-id", identity.browserId,
    "--theme-dir", paths.activeTheme, "--pause-file", paths.pause];
  if (options.foreground) {
    const result = await runInjector(injectorArgs, { stdio: "inherit" });
    process.exitCode = result.code;
    return;
  }
  const stdout = fsSync.openSync(paths.stdout, "a", 0o600);
  const stderr = fsSync.openSync(paths.stderr, "a", 0o600);
  const child = spawn(process.execPath, [injectorPath, ...injectorArgs], {
    detached: true,
    stdio: ["ignore", stdout, stderr],
  });
  fsSync.closeSync(stdout);
  fsSync.closeSync(stderr);
  child.unref();
  const state = {
    schemaVersion: 1,
    platform: "macos",
    port: options.port,
    injectorPid: child.pid,
    injectorStartedAt: processStartToken(child.pid),
    injectorPath,
    nodePath: process.execPath,
    nodeVersion: process.versions.node,
    codexApp: codex.appPath,
    codexExecutable: codex.executable,
    codexVersion: codex.version,
    codexTeamId: codex.teamId,
    browserId: identity.browserId,
    profilePath: options.profilePath,
    themeDir: paths.activeTheme,
    pauseFile: paths.pause,
    createdAt: new Date().toISOString(),
  };
  try {
    await sleep(650);
    if (!child.pid || !processCommand(child.pid)) throw new Error(`Injector exited during startup. See ${paths.stderr}`);
    await writeJsonAtomic(paths.state, state);
    const verify = await runInjector(["--verify", "--port", String(options.port), "--browser-id", identity.browserId,
      "--theme-dir", paths.activeTheme, "--timeout-ms", "30000"]);
    await fs.writeFile(paths.verify, `${verify.stdout}${verify.stderr}`, "utf8");
    if (verify.code !== 0) throw new Error(`Cultivation verification failed. See ${paths.verify}`);
  } catch (error) {
    try { process.kill(child.pid, "SIGTERM"); } catch {}
    await fs.rm(paths.state, { force: true });
    if (launchedWithCdp && codexOwnsPort(options.port, codex)) {
      try {
        await stopCodexPortSession(options.port, codex, true);
        if (!options.profilePath) launchCodex(codex);
      } catch {}
    }
    throw error;
  }
  console.log(`Codex Cultivation is active on verified loopback port ${options.port}.`);
}

async function verify(options, paths) {
  const codex = validateCodexApp(options.appPath);
  const state = await readJson(paths.state);
  if (!state) throw new Error("Codex Cultivation has no active state. Run start first.");
  if (!options.portExplicit) options.port = Number(state.port);
  const identity = await cdpIdentity(options.port, codex);
  if (!identity || identity.browserId !== state.browserId) {
    throw new Error(`No matching verified Codex CDP endpoint is active on port ${options.port}.`);
  }
  const args = ["--verify", "--port", String(options.port), "--browser-id", identity.browserId,
    "--theme-dir", paths.activeTheme, "--timeout-ms", "30000"];
  if (options.screenshot) args.push("--screenshot", options.screenshot);
  const result = await runInjector(args, { stdio: "inherit" });
  process.exitCode = result.code;
}

async function restore(options, paths) {
  const codex = validateCodexApp(options.appPath);
  const state = await readJson(paths.state);
  if (!state) {
    console.log("Codex Cultivation is not active.");
    return;
  }
  if (!options.portExplicit) options.port = Number(state.port);
  const ownsPort = codexOwnsPort(options.port, codex);
  let closedCodex = false;
  if (ownsPort && codexMainProcesses(codex).length) {
    let authorized = options.restartExisting;
    if (!authorized && options.promptRestart) {
      authorized = await promptRestart("恢复会关闭 Codex、移除修仙界面和调试端口，然后重新打开官方客户端。是否继续？");
    }
    if (!authorized) throw new Error("Restore needs permission to restart Codex. Use --restart-existing after saving work.");
    await stopCodexPortSession(options.port, codex, options.force);
    closedCodex = true;
  } else if (listenerPids(options.port).length) {
    throw new Error(`Port ${options.port} is active but is not owned by the validated Codex app; state was preserved.`);
  }
  try {
    await stopRecordedInjector(state);
    await fs.rm(paths.state, { force: true });
    await fs.rm(paths.pause, { force: true });
  } catch (error) {
    if (closedCodex && !options.noRelaunch) launchCodex(codex);
    throw error;
  }
  if (closedCodex && !options.noRelaunch) launchCodex(codex);
  console.log("Codex Cultivation restore completed; the saved CDP session is closed.");
}

async function install(options, paths) {
  const codex = validateCodexApp(options.appPath);
  await initializeThemeStore(paths);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) throw new Error(`Node.js 22 or newer is required; found ${process.versions.node}.`);
  console.log(`Codex Cultivation for macOS is ready for Codex ${codex.version}.`);
  console.log(`State directory: ${paths.root}`);
}

async function setPaused(paths, paused) {
  await initializeThemeStore(paths);
  if (paused) await fs.writeFile(paths.pause, "paused\n", { mode: 0o600 });
  else await fs.rm(paths.pause, { force: true });
  console.log(paused ? "Codex Cultivation is paused." : "Codex Cultivation is resumed.");
}

function printHelp() {
  console.log(`Usage: cultivation-macos.mjs <command> [options]\n\nCommands:\n  install\n  start\n  verify\n  pause\n  resume\n  set-image --image <path>\n  restore\n\nCommon options:\n  --port <1024-65535>\n  --restart-existing\n  --prompt-restart\n  --force\n  --screenshot <path>\n  --profile <path>\n  --state-root <path>`);
}

export { parseArgs, validateLoopbackWebSocket };

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  let releaseLock = null;
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === "help" || options.command === "--help" || options.command === "-h") {
      printHelp();
    } else {
      const paths = statePaths(options.stateRoot);
      releaseLock = await acquireLock(paths);
      if (options.command === "install") await install(options, paths);
      else if (options.command === "start") await start(options, paths);
      else if (options.command === "verify") await verify(options, paths);
      else if (options.command === "restore") await restore(options, paths);
      else if (options.command === "pause") await setPaused(paths, true);
      else if (options.command === "resume") await setPaused(paths, false);
      else if (options.command === "set-image") {
        if (!options.imagePath) throw new Error("set-image requires --image <path>.");
        const theme = await importThemeImage(paths, options.imagePath);
        console.log(`Active theme image updated: ${theme.image}`);
      } else throw new Error(`Unknown command: ${options.command}`);
    }
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  } finally {
    await releaseLock?.();
  }
}
