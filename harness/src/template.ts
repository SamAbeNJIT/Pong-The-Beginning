import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { GameSpec } from "./spec.ts";

const require = createRequire(import.meta.url);
type Engine = GameSpec["engine"];

const VENDOR: Record<Engine, { pkg: string; file: string }[]> = {
  phaser: [{ pkg: "phaser", file: "dist/phaser.min.js" }],
  three: [
    { pkg: "three", file: "build/three.module.js" },
    { pkg: "three", file: "build/three.core.js" },
  ],
};

// Package "exports" maps hide build files from require.resolve, so locate the package root.
function pkgFile(pkg: string, file: string): string {
  const main = require.resolve(pkg);
  const marker = path.join("node_modules", pkg) + path.sep;
  return path.join(main.slice(0, main.lastIndexOf(marker) + marker.length), file);
}

// The harness owns index.html and vendor/; the model only writes game code.
// That keeps loading, sizing and library versions identical across every game.
export function indexHtml(title: string, engine: Engine): string {
  const lib =
    engine === "phaser"
      ? `<script src="vendor/phaser.min.js"></script>`
      : `<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #game { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div id="game"></div>
${lib}
<script type="module" src="game.js"></script>
</body>
</html>
`;
}

export async function ensureVendor(dir: string, engine: Engine): Promise<void> {
  await mkdir(path.join(dir, "vendor"), { recursive: true });
  for (const f of VENDOR[engine]) {
    const dest = path.join(dir, "vendor", path.basename(f.file));
    try {
      await access(dest);
    } catch {
      await copyFile(pkgFile(f.pkg, f.file), dest);
    }
  }
}

export async function writeShell(dir: string, spec: GameSpec): Promise<void> {
  await mkdir(path.join(dir, "forge"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), indexHtml(spec.title, spec.engine));
  await writeFile(path.join(dir, "forge", "spec.json"), JSON.stringify(spec, null, 2) + "\n");
  await ensureVendor(dir, spec.engine);
}

export async function readSpec(dir: string): Promise<GameSpec> {
  return JSON.parse(await readFile(path.join(dir, "forge", "spec.json"), "utf8"));
}
