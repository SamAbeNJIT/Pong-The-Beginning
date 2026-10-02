import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { forgeArgs, forgeJson, gameDir, imageData, lineReader, listGames, resolvePaths } from "../core.mjs";

const HARNESS = path.resolve(import.meta.dirname, "../../harness");

test("paths: from source the repo's harness and games; packaged, Resources and Documents", () => {
  assert.deepEqual(resolvePaths({ packaged: false, appDir: "/r/studio" }), { harness: "/r/harness", games: "/r/games", samples: null });
  assert.deepEqual(resolvePaths({ packaged: true, resourcesPath: "/A/Resources", documents: "/U/Documents" }), {
    harness: "/A/Resources/harness",
    games: "/U/Documents/Forge Games",
    samples: "/A/Resources/sample-games",
  });
});

test("a game id from the UI can't leave the games folder", () => {
  assert.equal(gameDir("/g", "tiny-bastion"), "/g/tiny-bastion");
  for (const bad of ["../x", "a/b", "", ".hidden", "UP", "x\u0000"]) assert.throws(() => gameDir("/g", bad));
});

test("library: reads status, cost, changes and screenshot; skips non-games", async () => {
  const games = await mkdtemp(path.join(os.tmpdir(), "studio-lib-"));
  const add = async (slug, files) => {
    for (const [f, body] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(games, slug, f)), { recursive: true });
      await writeFile(path.join(games, slug, f), body);
    }
  };
  await add("built", {
    "game.js": "//",
    "forge/spec.json": JSON.stringify({ title: "Built", pitch: "p", engine: "three", controls: [{ key: "Space", action: "Jump" }] }),
    "forge/log.md": "# Forge log\n\nResult: SHIPPED after 2 round(s)\n",
    "forge/usage.json": JSON.stringify({ usd: 3.5 }),
    "forge/changes.md": "# Approved change requests\n\n## Change 1\n\nA\n\n## Change 2\n\nB\n",
    "forge/screens/3-play.png": "png",
  });
  await add("handmade", { "game.js": "//", "forge/spec.json": JSON.stringify({ title: "Hand" }) });
  await add("half", { "game.js": "//", "forge/spec.json": "{}", "forge/log.md": "Result: NOT SHIPPED (out of rounds)" });
  await add("no-spec", { "game.js": "//" });
  await add("crashed", { "forge/spec.json": JSON.stringify({ title: "Crashed" }), "forge/vision.md": "v" });
  await add("Bad Name", { "forge/spec.json": "{}" });

  const list = await listGames(games);
  const by = Object.fromEntries(list.map((g) => [g.slug, g]));
  assert.deepEqual(Object.keys(by).sort(), ["built", "crashed", "half", "handmade"]);
  assert.equal(by.crashed.status, "incomplete");
  assert.equal(by.built.status, "shipped");
  assert.equal(by.built.usd, 3.5);
  assert.equal(by.built.changes, 2);
  assert.equal(by.built.engine, "three");
  assert.equal(by.built.screenshot, path.join(games, "built/forge/screens/3-play.png"));
  assert.equal(by.handmade.status, "handmade");
  assert.equal(by.half.status, "unfinished");
  assert.equal(by.half.title, "half");

  assert.match(await imageData(games, by.built.screenshot), /^data:image\/png;base64,/);
  await assert.rejects(imageData(games, "/etc/passwd"));
  await assert.rejects(imageData(games, path.join(games, "built/forge/spec.json")));
  assert.deepEqual(await listGames(path.join(games, "missing")), []);
});

test("harness arguments for each job", () => {
  assert.deepEqual(forgeArgs({ kind: "build", vision: "v", profile: "deluxe", engine: "auto" }, "/g"), ["new", "v", "--profile", "deluxe", "--out", "/g"]);
  assert.deepEqual(forgeArgs({ kind: "build", vision: "v", engine: "three" }, "/g"), ["new", "v", "--profile", "standard", "--engine", "three", "--out", "/g"]);
  assert.deepEqual(forgeArgs({ kind: "change", slug: "tb", request: "r", profile: "quick" }, "/g"), ["iterate", "/g/tb", "r", "--profile", "quick"]);
  assert.deepEqual(forgeArgs({ kind: "serve", slug: "tb" }, "/g"), ["serve", "/g/tb", "--port", "0"]);
  assert.throws(() => forgeArgs({ kind: "serve", slug: "../x" }, "/g"));
});

test("stdout splits into events and log lines across chunk boundaries", () => {
  const events = [];
  const logs = [];
  const r = lineReader((e) => events.push(e), (l) => logs.push(l));
  r.push('hello\n@@forge {"type":"st');
  r.push('age","stage":"build"}\r\n@@forge {broken\nlast');
  r.end();
  assert.deepEqual(events, [{ type: "stage", stage: "build" }]);
  assert.deepEqual(logs, ["hello", "@@forge {broken", "last"]);
});

test("runs the real harness CLI and reads its profiles", async () => {
  const profiles = await forgeJson({ execPath: process.execPath, harness: HARNESS, args: ["profiles"] });
  assert.deepEqual(profiles.map((p) => p.id), ["quick", "standard", "deluxe"]);
  assert.equal(profiles.find((p) => p.id === "deluxe").advisor.model, "claude-fable-5-1");
});
