import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.FORGE_MODEL ?? "claude-opus-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
type Content = string | Anthropic.Beta.BetaContentBlockParam[];

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
  console.log(
    `  [${label}] ${msg.model} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`,
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
