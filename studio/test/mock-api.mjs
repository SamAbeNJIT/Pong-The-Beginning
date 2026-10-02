// A stand-in for the Messages API, so the end-to-end test builds a real game for free.
// Designer -> the Pong spec renamed, engineer -> Pong's source, reviewer -> "ship".
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const PONG = path.resolve(import.meta.dirname, "../../games/pong");

export async function startMockApi() {
  const spec = { ...JSON.parse(await readFile(path.join(PONG, "forge/spec.json"), "utf8")), title: "Skyline Pong", slug: "skyline-pong" };
  const game = await readFile(path.join(PONG, "game.js"), "utf8");
  const reply = (system) => {
    if (system.includes("lead designer")) return JSON.stringify(spec);
    if (system.includes("gameplay engineer")) return `<file path="game.js">\n${game}</file>`;
    if (system.includes("QA lead")) return JSON.stringify({ verdict: "ship", summary: "Clean and readable. It plays.", issues: [] });
    throw new Error("unknown role");
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const j = JSON.parse(body);
      await new Promise((r) => setTimeout(r, 600)); // long enough to see each stage in the UI
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      res.writeHead(200, { "content-type": "text/event-stream" });
      ev("message_start", {
        message: { id: "m", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: reply(JSON.stringify(j.system)) } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20000 } });
      ev("message_stop", {});
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
