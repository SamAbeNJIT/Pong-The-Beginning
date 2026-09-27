import assert from "node:assert/strict";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseFiles, safeRelPath } from "../src/files.ts";
import { playtest } from "../src/playtest.ts";
import { readSpec, writeShell } from "../src/template.ts";

const PONG = path.resolve(import.meta.dirname, "../../games/pong");
const tmp = () => mkdtemp(path.join(os.tmpdir(), "forge-test-"));

async function fixture(gameJs: string): Promise<string> {
  const dir = await tmp();
  await writeShell(dir, await readSpec(PONG));
  await writeFile(path.join(dir, "game.js"), gameJs);
  return dir;
}

const failed = (r: Awaited<ReturnType<typeof playtest>>) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test("reference Pong passes the playtest", async () => {
  const dir = await tmp();
  await cp(PONG, dir, { recursive: true });
  const r = await playtest(dir, { durationMs: 2000 });
  assert.deepEqual(failed(r), []);
  assert.ok(r.timeline.some((s) => s.state === "playing"));
});

test("a game that crashes on boot fails ready + errors", async () => {
  const dir = await fixture(`window.__FORGE__ = { ready: false, state: "menu", score: 0 };\nnull.boom();`);
  const r = await playtest(dir, { durationMs: 1000 });
  assert.equal(r.passed, false);
  assert.deepEqual(failed(r), ["contract: __FORGE__.ready", "no runtime errors"]);
  assert.match(r.errors.join("\n"), /uncaught/);
});

test("a game that ignores the start key fails", async () => {
  const dir = await fixture(`
    const f = (window.__FORGE__ = { ready: false, state: "menu", score: 0 });
    const c = document.createElement("canvas");
    c.width = 960; c.height = 640;
    document.getElementById("game").append(c);
    const g = c.getContext("2d");
    (function loop(t) {
      g.fillStyle = "#123"; g.fillRect(0, 0, 960, 640);
      g.fillStyle = "#fc0"; g.fillRect(100 + Math.sin(t / 200) * 50, 100, 40, 40);
      g.fillStyle = "#0cf"; g.fillRect(500, 300, 80, 20);
      f.ready = true;
      requestAnimationFrame(loop);
    })(0);`);
  const r = await playtest(dir, { durationMs: 1000 });
  assert.deepEqual(failed(r), ["startKey enters playing"]);
});

test("three.js shell loads the vendored module and renders WebGL", async () => {
  const dir = await tmp();
  await writeShell(dir, { ...(await readSpec(PONG)), engine: "three" });
  await writeFile(
    path.join(dir, "game.js"),
    `import * as THREE from "three";
    const f = (window.__FORGE__ = { ready: false, state: "menu", score: 0 });
    const r = new THREE.WebGLRenderer();
    r.setSize(innerWidth, innerHeight);
    document.getElementById("game").append(r.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101828);
    const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
    cam.position.z = 3;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
    scene.add(cube);
    addEventListener("keydown", (e) => { if (e.code === "Space") f.state = "playing"; });
    r.setAnimationLoop((t) => { cube.rotation.set(t / 700, t / 900, 0); r.render(scene, cam); f.ready = true; });`,
  );
  const r = await playtest(dir, { durationMs: 1000 });
  assert.deepEqual(failed(r), []);
});

test("parseFiles extracts blocks and keeps the last copy of a path", () => {
  const files = parseFiles(`intro\n<file path="game.js">\nA\n</file>\n<file path="src/b.js">\nB\n</file>\n<file path="game.js">\nC\n</file>`);
  assert.deepEqual(files, [
    { path: "game.js", content: "C\n" },
    { path: "src/b.js", content: "B\n" },
  ]);
});

test("safeRelPath blocks escapes and harness-owned files", () => {
  for (const bad of ["../x.js", "/etc/x.js", "a/../../x.js", "index.html", "vendor/phaser.min.js", "forge/spec.json", "x.sh"]) {
    assert.throws(() => safeRelPath(bad), Error, bad);
  }
  assert.equal(safeRelPath("./src/./a.js"), "src/a.js");
});
