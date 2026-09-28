import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatUsage, withLedger, type Usage } from "./llm.ts";
import { create, type RunOptions } from "./pipeline.ts";

export type Vision = { id: string; vision: string; tags: string[] };
export type EvalResult = {
  id: string;
  tags: string[];
  shipped: boolean;
  rounds: number;
  seconds: number;
  usage: Usage;
  error?: string;
};

export type EvalOptions = RunOptions & { file: string; out: string; only?: string[]; limit?: number; concurrency?: number };

/** Build every vision in the set and report ship rate, rounds, time and cost. */
export async function runEvals(opts: EvalOptions) {
  let visions: Vision[] = JSON.parse(await readFile(opts.file, "utf8"));
  if (opts.only?.length) visions = visions.filter((v) => opts.only!.includes(v.id));
  if (opts.limit) visions = visions.slice(0, opts.limit);
  await mkdir(opts.out, { recursive: true });

  const results: EvalResult[] = [];
  const queue = [...visions];
  const worker = async () => {
    for (let v = queue.shift(); v; v = queue.shift()) {
      console.log(`\n=== ${v.id} ===`);
      const t0 = Date.now();
      const { result, usage } = await withLedger(() =>
        create(v.vision, opts.out, { ...opts, slug: v.id }).then(
          (r) => ({ shipped: r.shipped, rounds: r.rounds }),
          (e: Error) => ({ shipped: false, rounds: 0, error: e.message }),
        ),
      );
      results.push({ id: v.id, tags: v.tags, ...result, seconds: Math.round((Date.now() - t0) / 1000), usage });
      await writeSummary(opts.out, visions, results); // keep partial results if the run dies
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));
  return writeSummary(opts.out, visions, results);
}

export function summarize(results: EvalResult[]) {
  const shipped = results.filter((r) => r.shipped);
  const usd = results.reduce((s, r) => s + r.usage.usd, 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    games: results.length,
    shipped: shipped.length,
    shipRate: results.length ? shipped.length / results.length : 0,
    avgRoundsShipped: avg(shipped.map((r) => r.rounds)),
    avgSeconds: avg(results.map((r) => r.seconds)),
    totalUsd: usd,
    usdPerGame: results.length ? usd / results.length : 0,
    usdPerShipped: shipped.length ? usd / shipped.length : 0,
  };
}

async function writeSummary(out: string, visions: Vision[], results: EvalResult[]) {
  const s = summarize(results);
  const order = new Map(visions.map((v, i) => [v.id, i]));
  const rows = [...results]
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map(
      (r) =>
        `| ${r.id} | ${r.tags.join(", ")} | ${r.shipped ? "yes" : "no"} | ${r.rounds} | ${r.seconds}s | $${r.usage.usd.toFixed(2)} | ${r.error ?? ""} |`,
    );
  const md = `# Eval run

| Games | Shipped | Ship rate | Avg rounds (shipped) | Avg time | Total | $/game | $/shipped |
|---|---|---|---|---|---|---|---|
| ${s.games}/${visions.length} | ${s.shipped} | ${(s.shipRate * 100).toFixed(0)}% | ${s.avgRoundsShipped.toFixed(1)} | ${s.avgSeconds.toFixed(0)}s | $${s.totalUsd.toFixed(2)} | $${s.usdPerGame.toFixed(2)} | $${s.usdPerShipped.toFixed(2)} |

| Vision | Tags | Shipped | Rounds | Time | Cost | Error |
|---|---|---|---|---|---|---|
${rows.join("\n")}

Costs are estimates from list prices. "Shipped" means the playtest passed and the critic said ship, with no human edits.
`;
  await writeFile(path.join(out, "summary.md"), md);
  await writeFile(path.join(out, "summary.json"), JSON.stringify({ summary: s, results }, null, 2) + "\n");
  console.log(`\n${s.shipped}/${s.games} shipped · ${formatUsage(sumUsage(results))}`);
  return s;
}

const sumUsage = (rs: EvalResult[]): Usage =>
  rs.reduce(
    (a, r) => ({
      calls: a.calls + r.usage.calls,
      input: a.input + r.usage.input,
      cacheWrite: a.cacheWrite + r.usage.cacheWrite,
      cacheRead: a.cacheRead + r.usage.cacheRead,
      output: a.output + r.usage.output,
      usd: a.usd + r.usage.usd,
    }),
    { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0 },
  );
