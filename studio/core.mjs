// Forge Studio's logic without Electron: paths, the game library, and running the
// harness CLI as a child process. main.mjs wires it to windows and IPC.
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** Where the harness lives and where games go, from source or inside the packaged .app. */
export function resolvePaths({ packaged, resourcesPath, appDir, documents }) {
  if (packaged) {
    return {
      harness: path.join(resourcesPath, "harness"),
      games: path.join(documents, "Forge Games"),
      samples: path.join(resourcesPath, "sample-games"),
    };
  }
  const repo = path.resolve(appDir, "..");
  return { harness: path.join(repo, "harness"), games: path.join(repo, "games"), samples: null };
}

/** First run of the packaged app: start the library with the sample games. */
export async function seedGames(games, samples) {
  if (!samples || existsSync(games) || !existsSync(samples)) return false;
  await mkdir(games, { recursive: true });
  await cp(samples, games, { recursive: true });
  return true;
}

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

/** Only plain folder names: a slug from the UI must never reach outside the games folder. */
export function gameDir(games, slug) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`bad game id: ${slug}`);
  return path.join(games, slug);
}

/** Every game in the folder, newest first, with what the library shows. */
export async function listGames(games) {
  const entries = await readdir(games, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(e.name)) continue;
    const dir = path.join(games, e.name);
    const spec = await readJson(path.join(dir, "forge", "spec.json")).catch(() => null);
    if (!spec) continue;
    const log = await readFile(path.join(dir, "forge", "log.md"), "utf8").catch(() => "");
    const usage = await readJson(path.join(dir, "forge", "usage.json")).catch(() => null);
    const changes = await readFile(path.join(dir, "forge", "changes.md"), "utf8").catch(() => "");
    const shot = ["3-play.png", "2-start.png", "1-boot.png"].map((s) => path.join(dir, "forge", "screens", s)).find(existsSync);
    // No log means the harness didn't finish a run: a hand-built game, or a build that
    // stopped before writing any code (no game.js), which isn't playable.
    const hasCode = existsSync(path.join(dir, "game.js"));
    const status = /Result: SHIPPED/.test(log) ? "shipped" : /Result: NOT SHIPPED/.test(log) ? "unfinished" : hasCode ? "handmade" : "incomplete";
    const modified = (await stat(path.join(dir, "game.js")).catch(() => stat(dir))).mtimeMs;
    out.push({
      slug: e.name,
      title: spec.title ?? e.name,
      pitch: spec.pitch ?? "",
      engine: spec.engine ?? "phaser",
      controls: spec.controls ?? [],
      startKey: spec.startKey ?? "Enter",
      status,
      usd: usage?.totalUsd ?? usage?.usd ?? null,
      changes: (changes.match(/^## Change \d+/gm) ?? []).length,
      screenshot: shot ?? null,
      modified,
    });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

/** A screenshot as a data URL, only from inside the games folder. */
export async function imageData(games, file) {
  const real = path.resolve(file);
  if (!real.startsWith(path.resolve(games) + path.sep) || path.extname(real) !== ".png") throw new Error("image outside the games folder");
  return `data:image/png;base64,${(await readFile(real)).toString("base64")}`;
}

/** A few ideas from the eval set, for the composer's suggestion chips. */
export async function exampleIdeas(harness, n = 6) {
  const visions = await readJson(path.join(harness, "evals", "visions.json")).catch(() => []);
  return visions
    .map((v) => v.vision)
    .sort(() => Math.random() - 0.5)
    .slice(0, n);
}

/** The harness CLI's arguments for each job the app can run. */
export function forgeArgs(job, games) {
  const engine = job.engine && job.engine !== "auto" ? ["--engine", job.engine] : [];
  const profile = ["--profile", job.profile ?? "standard"];
  switch (job.kind) {
    case "build":
      return ["new", job.vision, ...profile, ...engine, "--out", games];
    case "change":
      return ["iterate", gameDir(games, job.slug), job.request, ...profile];
    case "serve":
      return ["serve", gameDir(games, job.slug), "--port", "0"];
    case "doctor":
      return ["doctor"];
    case "profiles":
      return ["profiles"];
    case "setup":
      return ["setup"];
    default:
      throw new Error(`unknown job ${job.kind}`);
  }
}

/** Splits a child's stdout into @@forge events and plain log lines. */
export function lineReader(onEvent, onLog) {
  let buf = "";
  const line = (l) => {
    if (l.startsWith("@@forge ")) {
      try {
        return onEvent(JSON.parse(l.slice(8)));
      } catch {}
    }
    onLog(l);
  };
  return {
    push(chunk) {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) line(l.replace(/\r$/, ""));
    },
    end() {
      if (buf) line(buf);
      buf = "";
    },
  };
}

/**
 * Runs the harness CLI with Electron's own Node (ELECTRON_RUN_AS_NODE), so the app needs
 * no separate Node install. The API key goes in through the environment, never argv.
 */
export function runForge({ execPath, harness, args, apiKey, env = process.env, onEvent = () => {}, onLog = () => {} }) {
  const child = spawn(execPath, ["--import", "tsx", path.join(harness, "src", "cli.ts"), ...args], {
    cwd: harness,
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      FORGE_EVENTS: "1",
      FORCE_COLOR: "0",
      ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = lineReader(onEvent, (l) => onLog(l, "out"));
  const err = lineReader(onEvent, (l) => onLog(l, "err"));
  child.stdout.setEncoding("utf8").on("data", (c) => out.push(c));
  child.stderr.setEncoding("utf8").on("data", (c) => err.push(c));
  const done = new Promise((resolve) =>
    child.on("close", (code, signal) => {
      out.end();
      err.end();
      resolve({ code, signal });
    }),
  );
  return { child, done };
}

/** Runs a short CLI command and returns its stdout as JSON (profiles, doctor). */
export async function forgeJson(opts) {
  let text = "";
  const { done } = runForge({ ...opts, onLog: (l, stream) => stream === "out" && (text += l + "\n") });
  const { code } = await done;
  if (code !== 0) throw new Error(`forge ${opts.args[0]} exited with ${code}`);
  return JSON.parse(text);
}
