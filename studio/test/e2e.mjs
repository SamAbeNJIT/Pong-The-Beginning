// End to end: launch the real app, browse the library, play a game, build a new one
// against the mock API, and save screenshots. On Linux run it under xvfb-run.
//   node test/e2e.mjs [screenshot-dir]
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { _electron } from "../../harness/node_modules/playwright-core/index.mjs";
import { startMockApi } from "./mock-api.mjs";

const studio = path.resolve(import.meta.dirname, "..");
const shots = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), "forge-studio-shots"));
await mkdir(shots, { recursive: true });

const games = await mkdtemp(path.join(os.tmpdir(), "studio-games-"));
for (const g of ["tiny-bastion", "gusty-descent", "pong"]) await cp(path.join(studio, "..", "games", g), path.join(games, g), { recursive: true });

const api = await startMockApi();
// FORGE_STUDIO_EXEC runs a packaged build instead of the app from source.
const packaged = process.env.FORGE_STUDIO_EXEC;
const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
const app = await _electron.launch({
  executablePath: packaged ?? createRequire(import.meta.url)("electron"),
  args: packaged ? sandbox : [...sandbox, studio],
  env: {
    ...process.env,
    FORGE_STUDIO_GAMES: games,
    FORGE_STUDIO_USERDATA: await mkdtemp(path.join(os.tmpdir(), "studio-data-")),
    ANTHROPIC_API_KEY: "sk-ant-test-key-for-the-mock-api-only",
    ANTHROPIC_BASE_URL: api.url,
  },
});
const shot = async (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) });

try {
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1240, height: 820 }).catch(() => {});
  await win.waitForSelector(".profile");
  assert.equal(await win.locator(".profile").count(), 3);
  assert.equal(await win.locator(".lib-item").count(), 3);
  await shot(win, "1-new-game");
  await win.emulateMedia({ colorScheme: "dark" });
  await shot(win, "1-new-game-dark");
  await win.emulateMedia({ colorScheme: "light" });

  await win.locator(".lib-item", { hasText: "Tiny Bastion" }).click();
  await win.waitForSelector("#game-controls kbd");
  await shot(win, "2-game");

  const [game] = await Promise.all([app.waitForEvent("window"), win.click("#game-play")]);
  await game.waitForFunction("window.__FORGE__ && window.__FORGE__.ready === true", null, { timeout: 30000 });
  assert.match(game.url(), /^http:\/\/127\.0\.0\.1:\d+\/$/);
  await game.keyboard.press("Enter");
  await game.waitForTimeout(1500);
  await shot(game, "3-playing");
  await game.close();

  await win.click("#nav-settings");
  await shot(win, "4-settings");

  await win.click("#nav-new");
  await win.fill("#vision", "Pong on a city rooftop at sunset, first to seven wins.");
  await win.locator(".profile", { hasText: "Quick" }).click();
  await win.click("#build");
  await win.waitForSelector("#view-job:not([hidden])");
  await win.waitForSelector(".steps li.now");
  await shot(win, "5-building");
  await win.waitForSelector("text=Ready to play", { timeout: 180000 });
  await win.waitForSelector("#job-shot img");
  await shot(win, "6-ready");
  assert.equal(await win.locator(".lib-item").count(), 4);
  console.log(`e2e passed; screenshots in ${shots}`);
} finally {
  await app.close();
  api.close();
}
