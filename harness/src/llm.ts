import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.FORGE_MODEL ?? "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type Content = string | Anthropic.Beta.BetaContentBlockParam[];
type Stage = "design" | "build" | "repair" | "critic";

// Opus 5.5 at medium beats Opus 5 at high, so spend thinking where code gets written.
// Override per stage for effort sweeps, e.g. FORGE_EFFORT_BUILD=xhigh.
const DEFAULT_EFFORT: Record<Stage, Effort> = { design: "medium", build: "high", repair: "medium", critic: "medium" };
export const effortFor = (stage: Stage): Effort =>
  (process.env[`FORGE_EFFORT_${stage.toUpperCase()}`] as Effort | undefined) ?? DEFAULT_EFFORT[stage];

// List prices in $ per million tokens. Cache writes bill at 1.25x input (5-minute TTL) or 2x (1-hour TTL).
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
  const p = PRICES[msg.model] ?? PRICES[MODEL] ?? PRICES["claude-opus-5-5"]!;
  const write = u.cache_creation_input_tokens ?? 0;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const writeCost = write1h * p.in * 2 + (write - write1h) * p.in * 1.25;
  const usd = (u.input_tokens * p.in + writeCost + read * p.read + u.output_tokens * p.out) / 1e6;
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

// One-hour TTL: build and repair turns can each generate for several minutes, which
// would let a 5-minute entry expire before the next turn starts.
const CACHE_1H = { type: "ephemeral" as const, ttl: "1h" as const };

// The frozen system prompt gets its own breakpoint so every call with the same role,
// across every game in a run, reads it back from cache.
function base(system: string, effort: Effort) {
  return {
    model: MODEL,
    max_tokens: 128000, // Opus 5.5's ceiling; a build at high effort already used 53k
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const, // reroute safety-classifier declines server-side
    thinking: { type: "adaptive" as const },
    system: [{ type: "text" as const, text: system, cache_control: CACHE_1H }],
    output_config: { effort },
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
    `  [${label}] ${msg.model} in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens} ~$${usd.toFixed(3)}`,
  );
}

export const textOf = (msg: Anthropic.Beta.BetaMessage) =>
  msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

/**
 * One turn of a multi-turn conversation. The caller keeps `messages` append-only and
 * pushes the returned assistant content back unchanged (thinking blocks included), so
 * automatic caching re-reads the whole prior conversation at the cache-read price.
 */
export async function converse(
  label: string,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  effort: Effort,
): Promise<Anthropic.Beta.BetaMessage> {
  const msg = await api()
    .beta.messages.stream({ ...base(system, effort), cache_control: CACHE_1H, messages })
    .finalMessage();
  check(msg, label);
  return msg;
}

/**
 * Schema-constrained one-shot generation (design docs, critiques). No automatic caching:
 * the prompt ends in content unique to this request, so a tail cache entry is never read.
 */
export async function generateObject<S extends z.ZodType>(
  label: string,
  system: string,
  content: Content,
  effort: Effort,
  schema: S,
): Promise<z.infer<S>> {
  const b = base(system, effort);
  const msg = await api()
    .beta.messages.stream({
      ...b,
      output_config: { ...b.output_config, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  check(msg, label);
  if (msg.parsed_output == null) throw new Error(`${label}: response did not match schema`);
  return msg.parsed_output;
}

export function pngBlock(png: Buffer): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } };
}
