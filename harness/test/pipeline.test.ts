// End-to-end pipeline tests against a local mock of the Messages API (no key, no network).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { runEvals } from "../src/eval.ts";
import { withLedger } from "../src/llm.ts";
import { create } from "../src/pipeline.ts";

const PONG = path.resolve(import.meta.dirname, "../../games/pong");
const BROKEN = `window.__FORGE__ = { ready: false, state: "menu", score: 0 };\nnotDefined();`;
const mock = { spec: {} as Record<string, unknown>, build: "", repair: "", calls: [] as string[] };

// Streams one text block per request, picking the reply from the system prompt's role.
function reply(system: string): [string, string] {
  if (system.includes("fixing and improving")) return ["repair", `<file path="game.js">\n${mock.repair}</file>`];
  if (system.includes("lead designer")) return ["design", JSON.stringify(mock.spec)];
  if (system.includes("QA lead")) return ["critic", JSON.stringify({ verdict: "ship", summary: "ok", issues: [] })];
  return ["build", `<file path="game.js">\n${mock.build}</file>`];
}

let server: http.Server;
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const j = JSON.parse(body);
      const [role, text] = reply(typeof j.system === "string" ? j.system : JSON.stringify(j.system));
      mock.calls.push(role);
      const ev = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      res.writeHead(200, { "content-type": "text/event-stream" });
      ev("message_start", {
        message: { id: "m", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2000 } });
      ev("message_stop", {});
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  mock.spec = JSON.parse(await readFile(path.join(PONG, "forge/spec.json"), "utf8"));
  mock.repair = await readFile(path.join(PONG, "game.js"), "utf8");
});
after(() => server.close());

test("eval run: broken build is repaired, critic ships, cost is tracked", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-eval-"));
  const file = path.join(dir, "visions.json");
  await writeFile(file, JSON.stringify([{ id: "pong-test", vision: "classic pong", tags: ["2d"] }]));
  mock.build = BROKEN;
  mock.calls = [];

  const s = await runEvals({ file, out: path.join(dir, "run"), rounds: 3, critic: true, durationMs: 1000 });

  assert.deepEqual(mock.calls, ["design", "build", "repair", "critic"]);
  assert.equal(s.shipped, 1);
  assert.equal(s.avgRoundsShipped, 2);
  // 4 calls x (1000 in x $5 + 2000 out x $25) / 1M = $0.22
  assert.ok(Math.abs(s.totalUsd - 0.22) < 1e-9, `totalUsd=${s.totalUsd}`);
  assert.match(await readFile(path.join(dir, "run/summary.md"), "utf8"), /\| pong-test \| 2d \| yes \| 2 \|/);
  assert.ok(existsSync(path.join(dir, "run/pong-test/forge/usage.json")));
});

test("a hostile slug from the model can't escape the output folder", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-slug-"));
  mock.spec = { ...mock.spec, slug: "../../Evil Slug!" };
  mock.build = mock.repair;
  const { result } = await withLedger(() => create("pong", dir, { rounds: 1, critic: false, durationMs: 500 }));
  assert.equal(result.dir, path.join(dir, "evil-slug"));
  assert.equal(result.shipped, true);
});
