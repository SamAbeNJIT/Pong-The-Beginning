import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { applyEdits, parseEdits, parseFiles, readSource, renderSource, writeFiles, type Edit } from "./files.ts";
import { emit } from "./events.ts";
import { advisorOn, converse, currentUsage, effortFor, formatUsage, generateObject, pngBlock, textOf } from "./llm.ts";
import { formatReport, playtest, type PlaytestReport } from "./playtest.ts";
import { CRITIC_SYSTEM, DESIGN_SYSTEM, ENGINEER_SYSTEM } from "./prompts.ts";
import { Critique, GameSpec } from "./spec.ts";
import { addChange, readChanges, readSpec, writeShell } from "./template.ts";

export type RunOptions = { rounds: number; critic: boolean; durationMs: number };

const specText = (spec: GameSpec) => `<design>\n${JSON.stringify(spec, null, 2)}\n</design>`;
const changesText = (changes: string[]) =>
  changes.length
    ? `\n\n<approved_changes>\nThe player approved these changes after the design. They override it, including its outOfScope list.\n\n${changes.map((c, i) => `Change ${i + 1}:\n${c}`).join("\n\n")}\n</approved_changes>`
    : "";
const text = (t: string): Anthropic.Beta.BetaTextBlockParam => ({ type: "text", text: t });

const MAX_CONTINUATIONS = 2;
const MAX_PAUSES = 5; // a server-side tool loop (the advisor) can pause a turn; resume it as is
const CONTINUE =
  "Your reply hit the output limit and was cut off. Continue from where you stopped: resend in full any file that was cut off, then send the files you haven't sent yet. Don't resend files that were already complete.";

// The advisor can't be forced (Opus 5.5 rejects forced tool_choice), so turns ask for it.
const ADVISE_BUILD =
  "\n\nYou can consult the advisor tool, which is backed by a stronger model. Call it once before you write any code: share your plan for the code structure and the trickiest mechanics, then follow its advice.";
const ADVISE_REPAIR = "\n\nIf a root cause isn't obvious, consult the advisor before you edit.";

export async function design(vision: string, engine?: GameSpec["engine"]): Promise<GameSpec> {
  emit("stage", { stage: "design" });
  const hint = engine ? `\n\nUse engine "${engine}".` : "";
  return generateObject("design", DESIGN_SYSTEM, `<vision>\n${vision}\n</vision>${hint}`, effortFor("design"), GameSpec);
}

/**
 * One game's engineering conversation: build, then every repair, as turns of a single
 * append-only thread. Each turn re-reads the prior turns from cache instead of resending
 * the source, and repairs come back as small edits instead of whole files.
 */
export class Studio {
  private messages: Anthropic.Beta.BetaMessageParam[] = [];
  private intro: Anthropic.Beta.BetaTextBlockParam[] = [];
  private note = ""; // edit failures etc., reported at the start of the next turn

  constructor(
    private dir: string,
    private spec: GameSpec,
  ) {}

  /** For an existing game: the first turn carries the design and current source. */
  static async resume(dir: string): Promise<Studio> {
    const s = new Studio(dir, await readSpec(dir));
    const source = renderSource(await readSource(dir));
    const changes = changesText(await readChanges(dir));
    s.intro = [text(`${specText(s.spec)}${changes}\n\nThis game is already implemented. Current source:\n\n${source}`)];
    return s;
  }

  async build(): Promise<void> {
    emit("stage", { stage: "build" });
    const ask = `${specText(this.spec)}\n\nImplement this game.${advisorOn() ? ADVISE_BUILD : ""}`;
    await this.turn("build", [text(ask)], effortFor("build"));
  }

  async revise(feedback: string, screenshots: string[] = []): Promise<void> {
    const images = await Promise.all(screenshots.map(async (s) => pngBlock(await readFile(path.join(this.dir, s)))));
    const shots = screenshots.length ? `Screenshots above: ${screenshots.join(", ")}.\n\n` : "";
    const advise = advisorOn() ? ADVISE_REPAIR : "";
    await this.turn("repair", [...images, text(`${this.note}${shots}${feedback}${advise}`)], effortFor("repair"));
  }

  private async turn(label: string, content: Anthropic.Beta.BetaContentBlockParam[], effort: Parameters<typeof converse>[3]) {
    const start = this.messages.length;
    this.messages.push({ role: "user", content: [...this.intro, ...content] });
    const replies: string[] = [];
    try {
      // A reply cut off at max_tokens is kept and continued in the same thread, so a big
      // build isn't thrown away. Only a cut inside the text can be continued: a cut inside
      // thinking leaves an unsigned block the API won't accept back.
      let reply = "";
      for (let n = 0, pauses = 0; ; ) {
        const msg = await converse(label, ENGINEER_SYSTEM, this.messages, effort);
        this.messages.push({ role: "assistant", content: msg.content }); // unchanged, thinking blocks included
        reply += textOf(msg);
        // A paused turn is the same reply continuing: resend as is, no new user message.
        if (msg.stop_reason === "pause_turn" && pauses++ < MAX_PAUSES) continue;
        replies.push(reply);
        reply = "";
        if (msg.stop_reason !== "max_tokens") break;
        n++;
        if (msg.content.at(-1)?.type !== "text" || n > MAX_CONTINUATIONS) {
          throw new Error(`${label}: output hit max_tokens; try a lower effort (FORGE_EFFORT_${label.toUpperCase()})`);
        }
        this.messages.push({ role: "user", content: [text(CONTINUE)] });
      }
    } catch (e) {
      this.messages.length = start; // drop the unfinished turn so the thread stays well-formed
      throw e;
    }
    this.intro = [];
    this.note = "";
    // Parse each reply on its own: a file cut off in one is resent whole in the next.
    const byPath = new Map<string, string>();
    const edits: Edit[] = [];
    for (const r of replies) {
      try {
        for (const f of parseFiles(r)) byPath.set(f.path, f.content);
      } catch {}
      edits.push(...parseEdits(r));
    }
    const files = [...byPath].map(([p, c]) => ({ path: p, content: c }));
    if (!files.length && !edits.length) {
      this.note = "Your last reply contained no <file> or <edit> blocks, so nothing changed.\n\n";
      return;
    }
    await writeFiles(this.dir, files);
    const failures = await applyEdits(this.dir, edits);
    console.log(`  ${files.length} file(s), ${edits.length - failures.length}/${edits.length} edit(s) applied`);
    if (failures.length) {
      const paths = new Set(edits.map((e) => e.path));
      const current = (await readSource(this.dir)).filter((f) => paths.has(f.path));
      this.note = `Some edits failed to apply:\n${failures.join("\n")}\n\nCurrent contents of those files:\n\n${renderSource(current)}\n\n`;
    }
  }
}

async function critique(dir: string, spec: GameSpec, report: PlaytestReport): Promise<Critique> {
  const images = await Promise.all(report.screenshots.map(async (s) => pngBlock(await readFile(path.join(dir, s)))));
  return generateObject(
    "critic",
    CRITIC_SYSTEM,
    [
      text(specText(spec) + changesText(await readChanges(dir))),
      ...images,
      text(
        `Screenshots: ${report.screenshots.join(", ")} (menu, just after start, after ${report.timeline.at(-1)?.t ?? 0}ms of random input).\n\nState timeline:\n${JSON.stringify(report.timeline)}\n\nPlaytest checks:\n${formatReport(report)}`,
      ),
    ],
    effortFor("critic"),
    Critique,
  );
}

const playtestFeedback = (r: PlaytestReport) =>
  `<playtest>\n${formatReport(r)}\n\nErrors:\n${r.errors.join("\n") || "none"}\n</playtest>\n\nFix every failing check.`;

const critiqueFeedback = (c: Critique) =>
  `<review>\n${c.summary}\n\n${c.issues.map((i) => `- [${i.severity}] ${i.description}`).join("\n")}\n</review>\n\nAddress every issue.`;

/** Playtest -> (repair | critique -> repair) until it ships or rounds run out. */
export async function converge(studio: Studio, dir: string, opts: RunOptions): Promise<{ shipped: boolean; rounds: number }> {
  const spec = await readSpec(dir);
  const log: string[] = [];
  for (let round = 1; round <= opts.rounds; round++) {
    console.log(`\n— round ${round}: playtest`);
    emit("stage", { stage: "playtest", round });
    const report = await playtest(dir, { durationMs: opts.durationMs });
    console.log(formatReport(report));
    emit("playtest", {
      round,
      passed: report.passed,
      fps: Math.round(report.fps),
      checks: report.checks,
      screenshots: report.screenshots.map((s) => path.resolve(dir, s)),
    });
    log.push(`## Round ${round}\n\n\`\`\`\n${formatReport(report)}\n\`\`\``);

    let feedback: string;
    let shots: string[];
    if (!report.passed) {
      feedback = playtestFeedback(report);
      shots = report.screenshots.slice(-1); // crashes are in the errors; one frame is enough context
    } else if (opts.critic) {
      console.log("— critic");
      emit("stage", { stage: "review", round });
      const c = await critique(dir, spec, report);
      console.log(`  ${c.verdict}: ${c.summary}`);
      emit("review", { round, verdict: c.verdict, summary: c.summary, issues: c.issues });
      log.push(`Critic: **${c.verdict}** — ${c.summary}\n\n${c.issues.map((i) => `- [${i.severity}] ${i.description}`).join("\n")}`);
      if (c.verdict === "ship") return finish(dir, log, true, round);
      feedback = critiqueFeedback(c);
      shots = report.screenshots; // show the engineer what the critic saw
    } else {
      return finish(dir, log, true, round);
    }
    if (round === opts.rounds) break;
    console.log("— repair");
    emit("stage", { stage: "repair", round });
    try {
      await studio.revise(feedback, shots);
    } catch (e) {
      // A failed call shouldn't end the run; the next round re-tests and retries.
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
  // usage.json holds this run's usage plus totalUsd, the game's cost across every run.
  const file = path.join(dir, "forge", "usage.json");
  const before = await readFile(file, "utf8").then(JSON.parse).catch(() => null);
  const totalUsd = (before?.totalUsd ?? before?.usd ?? 0) + (usage?.usd ?? 0);
  if (usage) await writeFile(file, JSON.stringify({ ...usage, totalUsd }, null, 2) + "\n");
  emit("done", { shipped, rounds, dir: path.resolve(dir), usd: usage?.usd, totalUsd });
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
  emit("design", { title: spec.title, slug: spec.slug, engine: spec.engine, pitch: spec.pitch, dir: path.resolve(dir) });
  await writeShell(dir, spec);
  await writeFile(path.join(dir, "forge", "vision.md"), vision + "\n");
  console.log("— build");
  const studio = new Studio(dir, spec);
  await studio.build();
  return { dir, ...(await converge(studio, dir, opts)) };
}

/** Playtest and repair an existing game. */
export async function fix(dir: string, opts: RunOptions) {
  return converge(await Studio.resume(dir), dir, opts);
}

/** Apply a human change request to an existing game, then converge again. */
export async function iterate(dir: string, request: string, opts: RunOptions) {
  const studio = await Studio.resume(dir); // reads earlier changes; this one arrives as the request
  await addChange(dir, request);
  console.log("— change");
  emit("stage", { stage: "change" });
  await studio.revise(`<change_request>\n${request}\n</change_request>\n\nImplement this change.`);
  return converge(studio, dir, opts);
}
