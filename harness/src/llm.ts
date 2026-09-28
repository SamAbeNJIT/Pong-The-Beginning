import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.FORGE_MODEL ?? "claude-opus-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type Content = string | Anthropic.Beta.BetaContentBlockParam[];

// List prices in $ per million tokens. Cache writes (5-minute TTL) bill at 1.25x input.
const PRICES: Record<string, { in: number; out: number; read: number }> = {
  "claude-opus-5": { in: 5, out: 25, read: 0.5 },
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 },
  "claude-fable-5-1": { in: 10, out: 50, read: 0.25 },
  "claude-sonnet-5": { in: 2, out: 10, read: 0.2 },
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1 },
};

export type Usage = { calls: number; input: number; cacheWrite: number; cacheRead: number; output: number; usd: number };
const emptyUsage = (): Usage => ({ calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0 });

// Each game run gets its own ledger, so concurrent eval runs don't mix their costs.
const ledger = new AsyncLocalStorage<Usage>();
export const currentUsage = () => ledger.getStore();
export async function withLedger<T>(fn: () => Promise<T>): Promise<{ result: T; usage: Usage }> {
  const usage = emptyUsage();
  const result = await ledger.run(usage, fn);
  return { result, usage };
}

export function formatUsage(u: Usage): string {
  return `${u.calls} calls, in ${u.input} + cache write ${u.cacheWrite} + cache read ${u.cacheRead}, out ${u.output} tokens, ~$${u.usd.toFixed(2)}`;
}

function record(msg: Anthropic.Beta.BetaMessage) {
  const u = msg.usage;
  const p = PRICES[msg.model] ?? PRICES[MODEL] ?? PRICES["claude-opus-5"]!;
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const usd = (u.input_tokens * p.in + write * p.in * 1.25 + read * p.read + u.output_tokens * p.out) / 1e6;
  const store = ledger.getStore();
  if (store) {
    store.calls++;
    store.input += u.input_tokens;
    store.cacheWrite += write;
    store.cacheRead += read;
    store.output += u.output_tokens;
    store.usd += usd;
  }
  return usd;
}

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic());

function base(system: string, content: Content, effort: Effort) {
  return {
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const, // reroute safety-classifier declines server-side
    thinking: { type: "adaptive" as const },
    cache_control: { type: "ephemeral" as const },
    system,
    messages: [{ role: "user" as const, content }],
  };
}

function check(msg: Anthropic.Beta.BetaMessage, label: string) {
  if (msg.stop_reason === "refusal") {
    throw new Error(`${label}: model declined (${msg.stop_details?.category ?? "unknown"})`);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error(`${label}: output hit max_tokens; the game is too large for one pass`);
  }
  const u = msg.usage;
  const usd = record(msg);
  console.log(
    `  [${label}] ${msg.model} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens} ~$${usd.toFixed(3)}`,
  );
}

/** Free-form text generation (code). Streams to avoid HTTP timeouts on long outputs. */
export async function generateText(label: string, system: string, content: Content, effort: Effort) {
  const msg = await api()
    .beta.messages.stream({ ...base(system, content, effort), output_config: { effort } })
    .finalMessage();
  check(msg, label);
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/** Schema-constrained generation (design docs, critiques). */
export async function generateObject<S extends z.ZodType>(
  label: string,
  system: string,
  content: Content,
  effort: Effort,
  schema: S,
): Promise<z.infer<S>> {
  const msg = await api()
    .beta.messages.stream({
      ...base(system, content, effort),
      output_config: { effort, format: betaZodOutputFormat(schema) },
    })
    .finalMessage();
  check(msg, label);
  if (msg.parsed_output == null) throw new Error(`${label}: response did not match schema`);
  return msg.parsed_output;
}

export function pngBlock(png: Buffer): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } };
}
