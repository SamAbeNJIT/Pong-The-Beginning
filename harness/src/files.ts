import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SourceFile = { path: string; content: string };
export type Edit = { path: string; find: string; replace: string };

const FILE_RE = /<file path="([^"]+)">\r?\n?([\s\S]*?)\r?\n?<\/file>/g;
const EDIT_RE =
  /<edit path="([^"]+)">\s*<find>\r?\n?([\s\S]*?)\r?\n?<\/find>\s*<replace>\r?\n?([\s\S]*?)\r?\n?<\/replace>\s*<\/edit>/g;
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

/** Targeted find/replace edits: repairs cost a few hundred output tokens instead of a whole file. */
export function parseEdits(text: string): Edit[] {
  return [...text.matchAll(EDIT_RE)].map(([, p, find, replace]) => ({ path: safeRelPath(p!), find: find!, replace: replace! }));
}

const count = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);
const trimLines = (s: string) => s.replace(/[ \t]+$/gm, "");
const spliceOnce = (hay: string, needle: string, repl: string) => {
  const i = hay.indexOf(needle);
  return hay.slice(0, i) + repl + hay.slice(i + needle.length); // not String.replace: code is full of `$`
};

/**
 * Applies edits in order. Each `find` must match exactly once (ignoring trailing
 * whitespace as a fallback). Returns a message for every edit that couldn't be applied.
 */
export async function applyEdits(dir: string, edits: Edit[]): Promise<string[]> {
  const failures: string[] = [];
  const contents = new Map<string, string>();
  for (const [i, e] of edits.entries()) {
    const file = path.join(dir, e.path);
    let content = contents.get(e.path) ?? (await readFile(file, "utf8").catch(() => undefined));
    if (content === undefined) {
      failures.push(`edit ${i + 1} (${e.path}): file does not exist; send a <file> block to create it`);
      continue;
    }
    // Deleting whole lines shouldn't leave blank ones behind.
    const find = e.replace === "" && count(content, e.find + "\n") === 1 ? e.find + "\n" : e.find;
    if (count(content, find) === 1) {
      content = spliceOnce(content, find, e.replace);
    } else if (count(content, find) === 0 && count(trimLines(content), trimLines(find)) === 1) {
      content = spliceOnce(trimLines(content), trimLines(find), e.replace);
    } else {
      const n = Math.max(count(content, find), count(trimLines(content), trimLines(find)));
      failures.push(`edit ${i + 1} (${e.path}): <find> text matched ${n} times; it must match exactly once`);
      continue;
    }
    contents.set(e.path, content);
  }
  for (const [p, content] of contents) await writeFile(path.join(dir, p), content);
  return failures;
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
