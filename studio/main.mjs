// Forge Studio: the Electron shell. Logic lives in core.mjs; this file owns windows,
// the API key (encrypted with the macOS Keychain via safeStorage) and IPC.
import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { exampleIdeas, forgeArgs, forgeJson, gameDir, imageData, listGames, resolvePaths, runForge, seedGames } from "./core.mjs";

const appDir = import.meta.dirname;
// Tests point the app at throwaway folders so they never touch a real library or settings.
if (process.env.FORGE_STUDIO_USERDATA) app.setPath("userData", process.env.FORGE_STUDIO_USERDATA);
const defaults = resolvePaths({
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appDir,
  documents: app.getPath("documents"),
});
if (process.env.FORGE_STUDIO_GAMES) Object.assign(defaults, { games: process.env.FORGE_STUDIO_GAMES, samples: null });
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

let settings = {};
let sessionKey = ""; // used when the OS can't encrypt (never written to disk in plain text)
let win;
let job = null; // the one build or change running now, plus what the UI needs to redraw it
const players = new Map(); // slug -> { win, child }

const gamesDir = () => settings.gamesDir ?? defaults.games;
const run = (args, extra = {}) => runForge({ execPath: process.execPath, harness: defaults.harness, args, ...extra });

async function loadSettings() {
  settings = await readFile(settingsFile(), "utf8").then(JSON.parse).catch(() => ({}));
}
async function saveSettings() {
  await mkdir(path.dirname(settingsFile()), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2));
}

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (settings.apiKey && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(settings.apiKey, "base64"));
    } catch {}
  }
  return sessionKey;
}
const keyStatus = () =>
  process.env.ANTHROPIC_API_KEY ? "env" : settings.apiKey ? "keychain" : sessionKey ? "session" : "missing";

const send = (msg) => win && !win.isDestroyed() && win.webContents.send("job", msg);

function startJob(spec) {
  if (job?.status === "running") throw new Error("A build is already running. Wait for it or cancel it first.");
  const key = apiKey();
  if (!key) throw new Error("Add your Anthropic API key in Settings first.");
  const id = Date.now();
  job = { id, ...spec, status: "running", startedAt: Date.now(), events: [], log: [] };
  const { child, done } = run(forgeArgs(spec, gamesDir()), {
    apiKey: key,
    onEvent: (e) => {
      if (e.type === "progress") job.live = { ...e, at: Date.now() };
      else {
        job.events.push({ ...e, at: Date.now() });
        if (e.type === "stage" || e.type === "call") job.live = null;
      }
      send({ id, event: e });
    },
    onLog: (line) => {
      job.log.push(line);
      if (job.log.length > 400) job.log.shift();
      send({ id, log: line });
    },
  });
  job.child = child;
  done.then(({ code, signal }) => {
    const finished = [...job.events].reverse().find((e) => e.type === "done");
    job.status = job.cancelled ? "cancelled" : finished ? (finished.shipped ? "shipped" : "unfinished") : code === 0 ? "done" : "failed";
    job.child = null;
    job.endedAt = Date.now();
    send({ id, end: { status: job.status, code, signal } });
    if (Notification.isSupported() && !win?.isFocused() && ["shipped", "unfinished"].includes(job.status)) {
      const title = job.events.find((e) => e.type === "design")?.title ?? job.title ?? "Your game";
      new Notification({ title: job.status === "shipped" ? `${title} is ready to play` : `${title} needs another pass`, silent: false }).show();
    }
  });
  return snapshot();
}

// What the renderer needs to redraw a job after a reload, without the child process.
const snapshot = () => job && { ...job, child: undefined };

async function play(slug) {
  const existing = players.get(slug);
  if (existing && !existing.win.isDestroyed()) return existing.win.focus();
  const dir = gameDir(gamesDir(), slug);
  const title = (await readFile(path.join(dir, "forge", "spec.json"), "utf8").then(JSON.parse).catch(() => ({}))).title ?? slug;
  let resolveUrl;
  const url = new Promise((r) => (resolveUrl = r));
  const { child, done } = run(forgeArgs({ kind: "serve", slug }, gamesDir()), {
    onEvent: (e) => e.type === "serving" && resolveUrl(e.url),
  });
  done.then(() => resolveUrl(null));
  const address = await url;
  if (!address) throw new Error(`Couldn't start ${title}.`);
  const game = new BrowserWindow({
    width: 1280,
    height: 800,
    title,
    backgroundColor: "#000000",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  game.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  game.webContents.on("will-navigate", (e, to) => !to.startsWith(address) && e.preventDefault());
  game.on("closed", () => {
    child.kill();
    players.delete(slug);
  });
  players.set(slug, { win: game, child });
  await game.loadURL(address);
  game.focus();
}

ipcMain.handle("init", async () => {
  const [profiles, doctor, examples] = await Promise.all([
    forgeJson({ execPath: process.execPath, harness: defaults.harness, args: ["profiles"] }),
    forgeJson({ execPath: process.execPath, harness: defaults.harness, args: ["doctor"] }).catch(() => ({ browser: null })),
    exampleIdeas(defaults.harness),
  ]);
  return {
    profiles,
    examples,
    browser: !!doctor.browser,
    gamesDir: gamesDir(),
    key: keyStatus(),
    encryption: safeStorage.isEncryptionAvailable(),
    job: snapshot(),
    last: { profile: settings.profile ?? "standard", engine: settings.engine ?? "auto" },
  };
});

ipcMain.handle("games:list", () => listGames(gamesDir()));
ipcMain.handle("image", (_e, file) => imageData(gamesDir(), file));

ipcMain.handle("key:save", async (_e, key) => {
  key = String(key ?? "").trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(key)) throw new Error("That doesn't look like an Anthropic API key (it starts with sk-ant-).");
  if (safeStorage.isEncryptionAvailable()) {
    settings.apiKey = safeStorage.encryptString(key).toString("base64");
    sessionKey = "";
    await saveSettings();
  } else sessionKey = key;
  return keyStatus();
});
ipcMain.handle("key:clear", async () => {
  delete settings.apiKey;
  sessionKey = "";
  await saveSettings();
  return keyStatus();
});

ipcMain.handle("games:choose-dir", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], defaultPath: gamesDir() });
  if (r.canceled || !r.filePaths[0]) return gamesDir();
  settings.gamesDir = r.filePaths[0];
  await saveSettings();
  return gamesDir();
});

ipcMain.handle("setup:browser", async () => {
  const { done } = run(["setup"], { onLog: (line) => send({ setup: line }) });
  const { code } = await done;
  const doctor = await forgeJson({ execPath: process.execPath, harness: defaults.harness, args: ["doctor"] }).catch(() => ({}));
  if (code !== 0 || !doctor.browser) throw new Error("The test browser didn't install. Check your internet connection and try again.");
  return true;
});

ipcMain.handle("job:build", async (_e, { vision, profile, engine }) => {
  vision = String(vision ?? "").trim();
  if (vision.length < 8) throw new Error("Describe your game in a sentence or two first.");
  Object.assign(settings, { profile, engine });
  await saveSettings();
  return startJob({ kind: "build", vision, profile, engine, title: null });
});
ipcMain.handle("job:change", (_e, { slug, request, profile }) => {
  request = String(request ?? "").trim();
  if (request.length < 4) throw new Error("Describe the change first.");
  gameDir(gamesDir(), slug); // validates the slug
  return startJob({ kind: "change", slug, request, profile, title: slug });
});
ipcMain.handle("job:cancel", () => {
  if (job?.status !== "running") return false;
  job.cancelled = true;
  job.child?.kill("SIGTERM");
  return true;
});
ipcMain.handle("job:dismiss", () => {
  if (job?.status !== "running") job = null;
  return true;
});

ipcMain.handle("game:play", (_e, slug) => play(slug));
ipcMain.handle("game:reveal", (_e, slug) => shell.showItemInFolder(path.join(gameDir(gamesDir(), slug), "game.js")));

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: "Forge Studio",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#16181d",
    show: false,
    webPreferences: { preload: path.join(appDir, "preload.cjs"), sandbox: true, contextIsolation: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(appDir, "ui", "index.html"));
}

app.whenReady().then(async () => {
  // Packaged builds get the icon from the bundle; from source, show it in the Dock too.
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(path.join(appDir, "build", "icon.png"));
  await loadSettings();
  if (!settings.gamesDir && defaults.samples) await seedGames(defaults.games, defaults.samples);
  if (!existsSync(gamesDir())) await mkdir(gamesDir(), { recursive: true });
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  job?.child?.kill("SIGTERM");
  for (const p of players.values()) p.child.kill();
});
