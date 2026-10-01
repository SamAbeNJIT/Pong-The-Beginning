import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { ensureVendor, readSpec } from "./template.ts";

export type Check = { name: string; ok: boolean; detail: string };
export type Sample = { t: number; state: string; score: number };
export type PlaytestReport = {
  passed: boolean;
  checks: Check[];
  errors: string[];
  timeline: Sample[];
  fps: number;
  screenshots: string[]; // relative to the game folder
};
export type PlaytestOptions = { durationMs?: number; seed?: number; headed?: boolean };

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

export function serve(dir: string, port = 0): Promise<http.Server> {
  const root = path.resolve(dir);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/favicon.ico") return void res.writeHead(204).end();
    const file = path.join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

// Playwright-core pins a Chromium revision; fall back to whatever is installed locally.
export function chromiumPath(): string | undefined {
  if (process.env.FORGE_CHROMIUM) return process.env.FORGE_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = path.join(root, d, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

// Counts rendered frames independently of the game's own loop, for an fps figure.
const FRAME_COUNTER = `window.__forgeFrames = 0;
(function tick() { window.__forgeFrames++; requestAnimationFrame(tick); })();`;

const STATES = new Set(["menu", "playing", "paused", "won", "lost"]);

type Snap = { state: string; score: number; frames: number };
const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const w = window as any;
    const f = w.__FORGE__ ?? {};
    return { state: String(f.state), score: Number(f.score ?? 0), frames: Number(w.__forgeFrames ?? 0) };
  });

// Decode screenshots inside a blank page so we need no image library in Node.
// Kept as a string: tsx's keepNames helper (__name) doesn't exist in the page.
const IMAGE_STATS = `async ([a64, b64]) => {
  const pixels = async (s) => {
    const img = new Image();
    img.src = "data:image/png;base64," + s;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, img.width, img.height).data;
  };
  const A = await pixels(a64);
  const colors = new Set();
  for (let i = 0; i < A.length; i += 4 * 97) colors.add(((A[i] >> 3) << 10) | ((A[i + 1] >> 3) << 5) | (A[i + 2] >> 3));
  let changed = 0;
  if (b64) {
    const B = await pixels(b64);
    let d = 0, n = 0;
    for (let i = 0; i < Math.min(A.length, B.length); i += 4 * 7) {
      n++;
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) d++;
    }
    changed = d / n;
  }
  return { colors: colors.size, changed };
}`;

const imageStats = (page: Page, a: Buffer, b?: Buffer): Promise<{ colors: number; changed: number }> =>
  page.evaluate(`(${IMAGE_STATS})(${JSON.stringify([a.toString("base64"), b?.toString("base64")])})`);

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Boots the game headless, checks the contract, then plays it with seeded random
 * input built from the spec's controls. Writes screenshots and forge/playtest.json.
 */
export async function playtest(dir: string, opts: PlaytestOptions = {}): Promise<PlaytestReport> {
  const { durationMs = 8000, seed = 1, headed = false } = opts;
  const spec = await readSpec(dir);
  await ensureVendor(dir, spec.engine);
  const shotsDir = path.join(dir, "forge", "screens");
  await mkdir(shotsDir, { recursive: true });

  const server = await serve(dir);
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    headless: !headed,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-networking",
      "--disable-component-update",
    ],
  });

  const checks: Check[] = [];
  const errors: string[] = [];
  const timeline: Sample[] = [];
  const screenshots: string[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  let fps = 0;

  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console.error: ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));
    await page.addInitScript(FRAME_COUNTER);

    const shot = async (name: string) => {
      const png = await page.screenshot();
      await writeFile(path.join(shotsDir, `${name}.png`), png);
      screenshots.push(`forge/screens/${name}.png`);
      return png;
    };

    const { port } = server.address() as AddressInfo;
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });

    const ready = await page
      .waitForFunction(() => (window as any).__FORGE__?.ready === true, null, { timeout: 10_000 })
      .then(() => true, () => false);
    add("contract: __FORGE__.ready", ready, ready ? "ready" : "window.__FORGE__.ready never became true within 10s");
    await page.waitForTimeout(500);
    const boot = await shot("1-boot");

    if (ready) {
      const s0 = await snap(page);
      add("boots into menu", s0.state === "menu", `state=${s0.state}`);

      await page.keyboard.press(spec.startKey);
      await page.waitForTimeout(400);
      const s1 = await snap(page);
      add("startKey enters playing", s1.state === "playing", `after ${spec.startKey}: state=${s1.state}`);
      const start = await shot("2-start");

      const keys = [...new Set(spec.controls.map((c) => c.key))];
      const rand = rng(seed);
      const t0 = Date.now();
      let nextSample = 0;
      let restarts = 0;
      let badKey = "";
      while (Date.now() - t0 < durationMs && keys.length) {
        const key = keys[Math.floor(rand() * keys.length)]!;
        try {
          await page.keyboard.down(key);
          await page.waitForTimeout(60 + Math.floor(rand() * 340));
          await page.keyboard.up(key);
        } catch {
          badKey = key;
          break;
        }
        const t = Date.now() - t0;
        if (t >= nextSample) {
          const s = await snap(page);
          timeline.push({ t, state: s.state, score: s.score });
          nextSample += 500;
          if (s.state === "won" || s.state === "lost") {
            await page.keyboard.press(spec.startKey); // keep exercising gameplay
            restarts++;
          }
        }
      }
      if (badKey) add("controls use valid key names", false, `Playwright rejected key "${badKey}"`);
      const s2 = await snap(page);
      fps = (s2.frames - s1.frames) / Math.max(1, (Date.now() - t0) / 1000);
      add("frame rate", fps >= 24, `${fps.toFixed(0)} fps (headless, software GL)`);
      const play = await shot("3-play");

      // A second tab backgrounds the game (and throttles rAF), so only open it now.
      const scratch = await context.newPage();
      const bootStats = await imageStats(scratch, boot);
      const playStats = await imageStats(scratch, play, start);
      add("renders a scene", bootStats.colors >= 3 && playStats.colors >= 3, `distinct colors: menu=${bootStats.colors} play=${playStats.colors}`);
      add("screen changes during play", playStats.changed > 0.0005, `${(playStats.changed * 100).toFixed(2)}% of sampled pixels changed`);
      const bad = timeline.find((s) => !STATES.has(s.state));
      add("state stays valid", !bad, bad ? `invalid state "${bad.state}" at ${bad.t}ms` : `restarts after win/lose: ${restarts}`);
    }

    add("no runtime errors", errors.length === 0, errors.length ? errors.slice(0, 15).join("\n") : "clean console");
  } finally {
    await browser.close();
    server.close();
  }

  const report: PlaytestReport = { passed: checks.every((c) => c.ok), checks, errors, timeline, fps, screenshots };
  await writeFile(path.join(dir, "forge", "playtest.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

export function formatReport(r: PlaytestReport): string {
  const lines = r.checks.map((c) => `${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail.split("\n")[0]}`);
  return [...lines, r.passed ? "=> playtest passed" : "=> playtest FAILED"].join("\n");
}
