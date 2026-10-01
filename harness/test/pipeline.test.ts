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
import { setEventSink, type ForgeEvent } from "../src/events.ts";
import { useProfile, withLedger } from "../src/llm.ts";
import { getProfile } from "../src/profiles.ts";
import { create, iterate } from "../src/pipeline.ts";
import { addChange, readChanges } from "../src/template.ts";

const PONG = path.resolve(import.meta.dirname, "../../games/pong");
const CRASH = "notDefined();\n";
const mock = { spec: {} as Record<string, unknown>, pong: "", build: "", repair: "", cutBuild: false, pauseBuild: false, calls: [] as string[], bodies: [] as any[], headers: [] as http.IncomingHttpHeaders[] };

// Streams one text block per request, picking the reply from the system prompt's role.
// Build and repair share the engineer prompt; a repair is any later turn of that thread.
function reply(system: string, messages: any[]): [string, string, string?] {
  if (system.includes("gameplay engineer")) {
    const file = `<file path="game.js">\n${mock.build}</file>`;
    const half = Math.floor(file.length / 2);
    if (messages.at(-1).role === "assistant") return ["resume", file.slice(half)]; // after pause_turn
    if (mock.pauseBuild && messages.length === 1) return ["build", file.slice(0, half), "pause_turn"];
    if (JSON.stringify(messages.at(-1)).includes("cut off")) return ["continue", file];
    if (messages.length > 1) return ["repair", mock.repair];
    return mock.cutBuild ? ["build", file.slice(0, 200), "max_tokens"] : ["build", file];
  }
  if (system.includes("lead designer")) return ["design", JSON.stringify(mock.spec)];
  if (system.includes("QA lead")) return ["critic", JSON.stringify({ verdict: "ship", summary: "ok", issues: [] })];
  throw new Error("unknown role");
}

let server: http.Server;
const log = console.log;
before(async () => {
  // Pipeline progress output is noise here, and heavy stdout from this file has tripped
  // node:test's child-process reporter ("Unable to deserialize cloned data").
  console.log = () => {};
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const j = JSON.parse(body);
      const [role, text, stop = "end_turn"] = reply(JSON.stringify(j.system), j.messages);
      mock.calls.push(role);
      mock.bodies.push(j);
      mock.headers.push(req.headers);
      // With the advisor tool on, report one consultation as its own usage iteration.
      const advised = j.tools?.some((t: any) => t.type === "advisor_20260301");
      const iterations = advised
        ? [{ type: "advisor_message", model: "claude-fable-5-1", input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null }]
        : null;
      const ev = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      res.writeHead(200, { "content-type": "text/event-stream" });
      ev("message_start", {
        message: { id: "m", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 2000, iterations } });
      ev("message_stop", {});
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  mock.spec = JSON.parse(await readFile(path.join(PONG, "forge/spec.json"), "utf8"));
  mock.pong = await readFile(path.join(PONG, "game.js"), "utf8");
});
after(() => {
  console.log = log;
  server.close();
});

test("eval run: a crashing build is fixed by an edit in the same cached thread", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-eval-"));
  const file = path.join(dir, "visions.json");
  await writeFile(file, JSON.stringify([{ id: "pong-test", vision: "classic pong", tags: ["2d"] }]));
  mock.build = CRASH + mock.pong;
  mock.repair = `The crash is a stray call.\n<edit path="game.js">\n<find>\n${CRASH}</find>\n<replace>\n</replace>\n</edit>`;
  mock.calls = [];
  mock.bodies = [];

  const s = await runEvals({ file, out: path.join(dir, "run"), rounds: 3, critic: true, durationMs: 1000 });

  assert.deepEqual(mock.calls, ["design", "build", "repair", "critic"]);
  assert.equal(s.shipped, 1);
  assert.equal(s.avgRoundsShipped, 2);
  assert.equal(await readFile(path.join(dir, "run/pong-test/game.js"), "utf8"), mock.pong);

  const [designReq, buildReq, repairReq] = mock.bodies;
  // Frozen system prompts carry a 1-hour breakpoint; only the engineer thread auto-caches its tail.
  for (const b of mock.bodies) assert.deepEqual(b.system.at(-1).cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(designReq.cache_control, undefined);
  assert.deepEqual(buildReq.cache_control, { type: "ephemeral", ttl: "1h" });
  // The repair is a follow-up turn: [user build, assistant reply, user playtest], history unchanged.
  assert.deepEqual(repairReq.messages.map((m: any) => m.role), ["user", "assistant", "user"]);
  assert.deepEqual(repairReq.messages[0], buildReq.messages[0]);
  assert.match(JSON.stringify(repairReq.messages[2]), /FAIL/);

  // 4 calls x (1000 in x $4 + 2000 out x $20) / 1M = $0.176 (Opus 5.5 list price)
  assert.ok(Math.abs(s.totalUsd - 0.176) < 1e-9, `totalUsd=${s.totalUsd}`);
  assert.match(await readFile(path.join(dir, "run/summary.md"), "utf8"), /\| pong-test \| 2d \| yes \| 2 \|/);
  assert.ok(existsSync(path.join(dir, "run/pong-test/forge/usage.json")));
});

test("a build cut off at max_tokens is continued in the same thread", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-cut-"));
  mock.build = mock.pong;
  mock.cutBuild = true;
  mock.calls = [];
  mock.bodies = [];
  const { result, usage } = await withLedger(() => create("pong", dir, { rounds: 1, critic: false, durationMs: 500 }));
  mock.cutBuild = false;

  assert.deepEqual(mock.calls, ["design", "build", "continue"]);
  assert.equal(usage.calls, 3); // the cut-off reply is billed too
  assert.equal(result.shipped, true);
  assert.equal(await readFile(path.join(result.dir, "game.js"), "utf8"), mock.pong);
  const [, buildReq, contReq] = mock.bodies;
  assert.deepEqual(contReq.messages.map((m: any) => m.role), ["user", "assistant", "user"]);
  assert.deepEqual(contReq.messages[0], buildReq.messages[0]);
});

test("iterate records the change request, and the critic judges against it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-iter-"));
  mock.build = mock.pong;
  const { result } = await withLedger(() => create("pong", dir, { rounds: 1, critic: false, durationMs: 500 }));
  mock.calls = [];
  mock.bodies = [];
  await withLedger(() => iterate(result.dir, "Add a second map.", { rounds: 1, critic: true, durationMs: 500 }));

  assert.deepEqual(mock.calls, ["build", "critic"]); // a resumed thread's first turn, then the review
  assert.match(JSON.stringify(mock.bodies[1].messages), /approved_changes.*Change 1:\\nAdd a second map\./);
  await addChange(result.dir, "Make it night.");
  assert.deepEqual(await readChanges(result.dir), ["Add a second map.", "Make it night."]);
});

test("deluxe: the Fable advisor rides on engineer turns only, is billed at Fable rates, and a paused turn resumes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-deluxe-"));
  const events: ForgeEvent[] = [];
  setEventSink((e) => events.push(e));
  useProfile(getProfile("deluxe"));
  mock.build = mock.pong;
  mock.pauseBuild = true;
  mock.calls = [];
  mock.bodies = [];
  mock.headers = [];
  try {
    const { result, usage } = await withLedger(() => create("pong", dir, { rounds: 1, critic: true, durationMs: 500 }));
    assert.equal(result.shipped, true);
    assert.equal(await readFile(path.join(result.dir, "game.js"), "utf8"), mock.pong); // the paused halves joined

    assert.deepEqual(mock.calls, ["design", "build", "resume", "critic"]);
    const [designReq, buildReq, resumeReq, criticReq] = mock.bodies;
    assert.equal(designReq.tools, undefined);
    assert.equal(criticReq.tools, undefined);
    for (const r of [buildReq, resumeReq]) assert.deepEqual(r.tools[0], {
      type: "advisor_20260301", name: "advisor", model: "claude-fable-5-1", max_uses: 2, max_tokens: 8000, caching: { type: "ephemeral", ttl: "5m" },
    });
    assert.match(String(mock.headers[1]!["anthropic-beta"]), /advisor-tool-2026-03-01/);
    assert.match(JSON.stringify(buildReq.messages), /consult the advisor tool/);
    assert.deepEqual(resumeReq.messages.map((m: any) => m.role), ["user", "assistant"]); // resent as is

    // 4 executor calls x $0.044 + 2 advisor consultations x (1000 in x $10 + 1000 out x $50) / 1M
    assert.ok(Math.abs(usage.usd - (4 * 0.044 + 2 * 0.06)) < 1e-9, `usd=${usage.usd}`);

    const types = events.map((e) => (e.type === "stage" ? `stage:${e.stage}` : e.type)).filter((t) => t !== "call");
    assert.deepEqual(types, ["stage:design", "design", "stage:build", "stage:playtest", "playtest", "stage:review", "review", "done"]);
    assert.equal(events.find((e) => e.type === "done")!.shipped, true);
  } finally {
    setEventSink(undefined);
    useProfile(getProfile("standard"));
    mock.pauseBuild = false;
  }
});

test("a hostile slug from the model can't escape the output folder", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-slug-"));
  mock.spec = { ...mock.spec, slug: "../../Evil Slug!" };
  mock.build = mock.pong;
  const { result } = await withLedger(() => create("pong", dir, { rounds: 1, critic: false, durationMs: 500 }));
  assert.equal(result.dir, path.join(dir, "evil-slug"));
  assert.equal(result.shipped, true);
});
