import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { emit } from "./events.ts";
import { getProfile, type Effort, type Profile, type Stage } from "./profiles.ts";

export const MODEL = process.env.FORGE_MODEL ?? "claude-opus-5-5";

export type { Effort };
type Content = string | Anthropic.Beta.BetaContentBlockParam[];

// The active profile sets effort per stage and the optional advisor. Opus 5.5 at medium
// beats Opus 5 at high, so the default spends thinking where code gets written.
let profile: Profile = getProfile("standard");
export const useProfile = (p: Profile) => void (profile = p);
export const activeProfile = () => profile;
export const advisorOn = () => !!profile.advisor;

// Override per stage for effort sweeps, e.g. FORGE_EFFORT_BUILD=xhigh.
export const effortFor = (stage: Stage): Effort =>
  (process.env[`FORGE_EFFORT_${stage.toUpperCase()}`] as Effort | undefined) ?? profile.effort[stage];

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

type Tokens = {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation?: Anthropic.Beta.BetaCacheCreation | null;
};

const priceOf = (model: string) => PRICES[model] ?? PRICES[MODEL] ?? PRICES["claude-opus-5-5"]!;

function cost(t: Tokens, model: string) {
  const p = priceOf(model);
  const write = t.cache_creation_input_tokens ?? 0;
  const write1h = t.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const writeCost = write1h * p.in * 2 + (write - write1h) * p.in * 1.25;
  return ((t.input_tokens ?? 0) * p.in + writeCost + (t.cache_read_input_tokens ?? 0) * p.read + (t.output_tokens ?? 0) * p.out) / 1e6;
}

// Top-level usage is the executor's. Advisor consultations are separate iterations billed
// at the advisor model's rates.
const advisorIterations = (u: Anthropic.Beta.BetaUsage) =>
  (u.iterations ?? []).filter((i): i is Anthropic.Beta.BetaAdvisorMessageIterationUsage => i.type === "advisor_message");

function record(msg: Anthropic.Beta.BetaMessage) {
  const u = msg.usage;
  const advice = advisorIterations(u);
  const usd = cost(u, msg.model) + advice.reduce((sum, i) => sum + cost(i, i.model), 0);
  const store = ledger.getStore();
  if (store) {
    store.calls++;
    store.input += u.input_tokens + advice.reduce((n, i) => n + i.input_tokens, 0);
    store.cacheWrite += (u.cache_creation_input_tokens ?? 0) + advice.reduce((n, i) => n + i.cache_creation_input_tokens, 0);
    store.cacheRead += (u.cache_read_input_tokens ?? 0) + advice.reduce((n, i) => n + i.cache_read_input_tokens, 0);
    store.output += u.output_tokens + advice.reduce((n, i) => n + i.output_tokens, 0);
    store.usd += usd;
  }
  return { usd, advice: advice.length };
}

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic());

// One-hour TTL: build and repair turns can each generate for several minutes, which
// would let a 5-minute entry expire before the next turn starts.
const CACHE_1H = { type: "ephemeral" as const, ttl: "1h" as const };

// The frozen system prompt gets its own breakpoint so every call with the same role,
// across every game in a run, reads it back from cache.
function base(system: string, effort: Effort, betas: string[] = []) {
  return {
    model: MODEL,
    max_tokens: 128000, // Opus 5.5's ceiling; a build at high effort already used 53k
    betas: ["server-side-fallback-2026-07-01", ...betas],
    fallbacks: "default" as const, // reroute safety-classifier declines server-side
    // Summarized thinking streams steadily while the model thinks. With the default
    // (omitted) a long think is minutes of silence, and home routers drop silent
    // connections. Billing is the same either way.
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    system: [{ type: "text" as const, text: system, cache_control: CACHE_1H }],
    output_config: { effort },
  };
}

// Bills every response, including the ones it then rejects: a cut-off reply still costs money.
function check(msg: Anthropic.Beta.BetaMessage, label: string, allowCutoff = false) {
  const u = msg.usage;
  const { usd, advice } = record(msg);
  const notes = [advice ? `advisor x${advice}` : "", msg.stop_reason === "max_tokens" ? "cut off at max_tokens" : ""].filter(Boolean);
  console.log(
    `  [${label}] ${msg.model} in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens} ~$${usd.toFixed(3)}${notes.length ? ` (${notes.join(", ")})` : ""}`,
  );
  emit("call", { label, model: msg.model, usd, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, advisor: advice, total: currentUsage()?.usd });
  if (msg.stop_reason === "refusal") {
    throw new Error(`${label}: model declined (${msg.stop_details?.category ?? "unknown"})`);
  }
  if (msg.stop_reason === "max_tokens" && !allowCutoff) {
    throw new Error(`${label}: output hit max_tokens`);
  }
}

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors worth another attempt: dropped or stalled connections, overload, rate limits. */
function retryable(e: unknown) {
  if (!(e instanceof Anthropic.AnthropicError)) return false; // a bug in our code, not the network
  if (e instanceof Anthropic.APIError && e.status && e.status < 500) return [408, 409, 429].includes(e.status);
  return true;
}

/** Plain words for the app and the log when a call finally fails. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.APIError && e.status) {
    if (e.status === 401) return "Claude rejected the API key. Check it in Settings.";
    if (e.status === 403) return "This API key isn't allowed to use the model.";
    if (e.status === 429) return "Hit Claude's rate limit. Wait a minute, then try again.";
    if (e.status >= 500) return "Claude is overloaded right now. Try again in a few minutes.";
    if (/credit balance/i.test(e.message)) return "Your Anthropic account is out of credits. Add credits in the Anthropic Console, then try again.";
  }
  if (e instanceof Anthropic.AnthropicError) {
    return "Lost the connection to Claude, even after retrying. Check your internet connection, then try again.";
  }
  return e instanceof Error ? e.message : String(e);
}

type Streamed = { abort(): void; finalMessage(): Promise<unknown>; on(event: "streamEvent", fn: (e: Anthropic.Beta.BetaRawMessageStreamEvent) => void): unknown };

/**
 * Runs one streamed request to completion. Reports live progress, aborts a stream that
 * has gone silent, and retries dropped or stalled connections with backoff. The SDK
 * retries a request that fails to start; a stream that dies midway would otherwise
 * end the whole run. A dropped attempt may still be billed for what it generated, and
 * the ledger can't see that.
 */
async function send<S extends Streamed>(label: string, open: () => S): Promise<Awaited<ReturnType<S["finalMessage"]>>> {
  const attempts = env("FORGE_RETRIES", 3);
  const idleMs = env("FORGE_IDLE_MS", 120_000);
  for (let attempt = 1; ; attempt++) {
    const stream = open();
    let last = Date.now();
    let stalled = false;
    let phase = "waiting";
    let text = "";
    let received = 0; // stream events so far; a changing count is the app's heartbeat
    let shown = "";
    const progress = () => {
      const lines = text.split("\n").length - 1;
      const file = [...text.slice(-4000).matchAll(/<(?:file|edit) path="([^"]+)"/g)].at(-1)?.[1];
      const now = JSON.stringify([phase, lines, file, received]);
      if (now !== shown) emit("progress", { label, phase, lines, file, attempt });
      shown = now;
    };
    stream.on("streamEvent", (e) => {
      last = Date.now();
      received++;
      if (e.type === "content_block_start") {
        const b = e.content_block;
        phase = b.type === "text" ? "writing" : b.type === "server_tool_use" ? "advisor" : b.type === "thinking" ? "thinking" : phase;
      } else if (e.type === "content_block_delta" && e.delta.type === "text_delta") {
        text += e.delta.text;
      }
    });
    const tick = setInterval(progress, 1500);
    const watchdog = setInterval(() => {
      if (Date.now() - last > idleMs) {
        stalled = true;
        stream.abort();
      }
    }, Math.min(5000, idleMs / 2));
    try {
      return (await stream.finalMessage()) as Awaited<ReturnType<S["finalMessage"]>>;
    } catch (e) {
      if (!(stalled || retryable(e)) || attempt >= attempts) throw e;
      const msg = (e as Error).message;
      const reason = stalled ? `no data for ${Math.round(idleMs / 1000)}s` : /terminated|ETIMEDOUT|ECONNRESET|socket|network/i.test(msg) ? "the connection was cut" : msg;
      const wait = env("FORGE_RETRY_BASE_MS", 5000) * 3 ** (attempt - 1);
      console.log(`  [${label}] connection problem (${reason}); retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1} of ${attempts})`);
      emit("retry", { label, attempt: attempt + 1, of: attempts, reason });
      await sleep(wait);
    } finally {
      clearInterval(tick);
      clearInterval(watchdog);
    }
  }
}

export const textOf = (msg: Anthropic.Beta.BetaMessage) =>
  msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

/**
 * One turn of a multi-turn conversation. The caller keeps `messages` append-only and
 * pushes the returned assistant content back unchanged (thinking blocks included), so
 * automatic caching re-reads the whole prior conversation at the cache-read price.
 * A reply cut off at max_tokens is returned, not thrown, so the caller can continue it.
 */
export async function converse(
  label: string,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  effort: Effort,
): Promise<Anthropic.Beta.BetaMessage> {
  // The advisor rides on every turn of the thread or none: removing it while the history
  // holds advisor results is a 400, so it comes from the profile, fixed for the run.
  const a = profile.advisor;
  const advisor = a
    ? {
        betas: ["advisor-tool-2026-03-01"],
        tools: [
          {
            type: "advisor_20260301" as const,
            name: "advisor" as const,
            model: a.model,
            max_uses: a.maxUses,
            max_tokens: a.maxTokens,
            caching: { type: "ephemeral" as const, ttl: "5m" as const },
          },
        ],
      }
    : { betas: [], tools: undefined };
  const msg = await send(label, () =>
    api().beta.messages.stream({ ...base(system, effort, advisor.betas), tools: advisor.tools, cache_control: CACHE_1H, messages }),
  );
  check(msg, label, true);
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
  const msg = await send(label, () =>
    api().beta.messages.stream({
      ...b,
      output_config: { ...b.output_config, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content }],
    }),
  );
  check(msg, label);
  if (msg.parsed_output == null) throw new Error(`${label}: response did not match schema`);
  return msg.parsed_output;
}

export function pngBlock(png: Buffer): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } };
}
