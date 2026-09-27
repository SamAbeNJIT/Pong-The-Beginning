import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SourceFile = { path: string; content: string };

const FILE_RE = /<file path="([^"]+)">\r?\n?([\s\S]*?)\r?\n?<\/file>/g;
const ALLOWED_EXT = new Set([".js", ".json", ".css"]);

/** Reject anything that could escape the game folder or clobber harness-owned files. */
export function safeRelPath(p: string): string {
  const norm = path.posix.normalize(p.replace(/\\/g, "/"));
  if (norm.startsWith("/") || norm.startsWith("..") || norm.includes("/../")) {
    throw new Error(`unsafe path: ${p}`);
  }
  if (norm === "index.html" || norm.startsWith("vendor/") || norm.startsWith("forge/")) {
    throw new Error(`harness-owned path: ${p}`);
  }
  if (!ALLOWED_EXT.has(path.posix.extname(norm))) throw new Error(`disallowed file type: ${p}`);
  return norm;
}

export function parseFiles(text: string): SourceFile[] {
  const out = new Map<string, string>();
  for (const [, p, content] of text.matchAll(FILE_RE)) out.set(safeRelPath(p!), content! + "\n");
  if (out.size === 0) throw new Error("model returned no <file> blocks");
  return [...out].map(([p, content]) => ({ path: p, content }));
}

export async function writeFiles(dir: string, files: SourceFile[]): Promise<void> {
  for (const f of files) {
    const dest = path.join(dir, f.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, f.content);
  }
}

/** Game source the model owns: everything except index.html, vendor/ and forge/. */
export async function readSource(dir: string): Promise<SourceFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: SourceFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const rel = path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/");
    try {
      safeRelPath(rel);
    } catch {
      continue;
    }
    files.push({ path: rel, content: await readFile(path.join(dir, rel), "utf8") });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function renderSource(files: SourceFile[]): string {
  return files.map((f) => `<file path="${f.path}">\n${f.content}</file>`).join("\n\n");
}
