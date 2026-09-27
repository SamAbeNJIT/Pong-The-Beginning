import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFiles, readSource, renderSource, writeFiles } from "./files.ts";
import { currentUsage, formatUsage, generateObject, generateText, pngBlock } from "./llm.ts";
import { formatReport, playtest, type PlaytestReport } from "./playtest.ts";
import { BUILD_SYSTEM, CRITIC_SYSTEM, DESIGN_SYSTEM, REPAIR_SYSTEM } from "./prompts.ts";
import { Critique, GameSpec } from "./spec.ts";
import { readSpec, writeShell } from "./template.ts";

export type RunOptions = { rounds: number; critic: boolean; durationMs: number };

const specText = (spec: GameSpec) => `<design>\n${JSON.stringify(spec, null, 2)}\n</design>`;

export async function design(vision: string, engine?: GameSpec["engine"]): Promise<GameSpec> {
  const hint = engine ? `\n\nUse engine "${engine}".` : "";
  return generateObject("design", DESIGN_SYSTEM, `<vision>\n${vision}\n</vision>${hint}`, "high", GameSpec);
}

export async function build(dir: string, spec: GameSpec): Promise<void> {
  const text = await generateText("build", BUILD_SYSTEM, `${specText(spec)}\n\nImplement this game.`, "xhigh");
  await writeFiles(dir, parseFiles(text));
}

async function repair(dir: string, spec: GameSpec, feedback: string, report?: PlaytestReport): Promise<void> {
  const source = renderSource(await readSource(dir));
  const images = [];
  for (const s of report?.screenshots ?? []) images.push(pngBlock(await readFile(path.join(dir, s))));
  const text = await generateText(
    "repair",
    REPAIR_SYSTEM,
    [
      { type: "text", text: `${specText(spec)}\n\n<source>\n${source}\n</source>` },
      ...images,
      { type: "text", text: `Screenshots above are ${report?.screenshots.join(", ") || "none"}.\n\n${feedback}` },
    ],
    "xhigh",
  );
  await writeFiles(dir, parseFiles(text));
}

async function critique(dir: string, spec: GameSpec, report: PlaytestReport): Promise<Critique> {
  const images = await Promise.all(report.screenshots.map(async (s) => pngBlock(await readFile(path.join(dir, s)))));
  return generateObject(
    "critic",
    CRITIC_SYSTEM,
    [
      { type: "text", text: specText(spec) },
      ...images,
      {
        type: "text",
        text: `Screenshots: ${report.screenshots.join(", ")} (menu, just after start, after ${report.timeline.at(-1)?.t ?? 0}ms of random input).\n\nState timeline:\n${JSON.stringify(report.timeline)}\n\nPlaytest checks:\n${formatReport(report)}`,
      },
    ],
    "high",
    Critique,
  );
}

const playtestFeedback = (r: PlaytestReport) =>
  `<playtest>\n${formatReport(r)}\n\nErrors:\n${r.errors.join("\n") || "none"}\n</playtest>\n\nFix every failing check.`;

const critiqueFeedback = (c: Critique) =>
  `<review>\n${c.summary}\n\n${c.issues.map((i) => `- [${i.severity}] ${i.description}`).join("\n")}\n</review>\n\nAddress every issue.`;

/** Playtest -> (repair | critique -> repair) until it ships or rounds run out. */
export async function converge(dir: string, opts: RunOptions): Promise<{ shipped: boolean; rounds: number }> {
  const spec = await readSpec(dir);
  const log: string[] = [];
  for (let round = 1; round <= opts.rounds; round++) {
    console.log(`\n— round ${round}: playtest`);
    const report = await playtest(dir, { durationMs: opts.durationMs });
    console.log(formatReport(report));
    log.push(`## Round ${round}\n\n\`\`\`\n${formatReport(report)}\n\`\`\``);

    let feedback: string;
    if (!report.passed) {
      feedback = playtestFeedback(report);
    } else if (opts.critic) {
      console.log("— critic");
      const c = await critique(dir, spec, report);
      console.log(`  ${c.verdict}: ${c.summary}`);
      log.push(`Critic: **${c.verdict}** — ${c.summary}\n\n${c.issues.map((i) => `- [${i.severity}] ${i.description}`).join("\n")}`);
      if (c.verdict === "ship") return finish(dir, log, true, round);
      feedback = critiqueFeedback(c);
    } else {
      return finish(dir, log, true, round);
    }
    if (round === opts.rounds) break;
    console.log("— repair");
    try {
      await repair(dir, spec, feedback, report);
    } catch (e) {
      // A malformed reply shouldn't end the run; the next round re-tests and retries.
      console.log(`  repair failed: ${(e as Error).message}`);
      log.push(`Repair failed: ${(e as Error).message}`);
    }
  }
  return finish(dir, log, false, opts.rounds);
}

async function finish(dir: string, log: string[], shipped: boolean, rounds: number) {
  const usage = currentUsage();
  const cost = usage ? `Cost so far: ${formatUsage(usage)} (estimated from list prices)\n\n` : "";
  const header = `# Forge log\n\nResult: ${shipped ? "SHIPPED" : "NOT SHIPPED (out of rounds)"} after ${rounds} round(s)\n\n${cost}`;
  await writeFile(path.join(dir, "forge", "log.md"), header + log.join("\n\n") + "\n");
  if (usage) await writeFile(path.join(dir, "forge", "usage.json"), JSON.stringify(usage, null, 2) + "\n");
  return { shipped, rounds };
}

export async function create(
  vision: string,
  outRoot: string,
  opts: RunOptions & { engine?: GameSpec["engine"]; slug?: string },
) {
  console.log("— design");
  const spec = await design(vision, opts.engine);
  // The slug becomes a folder name, so never trust it as a path.
  spec.slug = (opts.slug ?? spec.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  const dir = path.join(outRoot, spec.slug);
  console.log(`  ${spec.title} (${spec.engine}): ${spec.pitch}`);
  await writeShell(dir, spec);
  await writeFile(path.join(dir, "forge", "vision.md"), vision + "\n");
  console.log("— build");
  await build(dir, spec);
  return { dir, ...(await converge(dir, opts)) };
}

/** Apply a human change request to an existing game, then converge again. */
export async function iterate(dir: string, request: string, opts: RunOptions) {
  const spec = await readSpec(dir);
  console.log("— change");
  await repair(dir, spec, `<change_request>\n${request}\n</change_request>\n\nImplement this change.`);
  return converge(dir, opts);
}
