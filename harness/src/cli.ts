#!/usr/bin/env -S npx tsx
import path from "node:path";
import { parseArgs } from "node:util";
import { runEvals } from "./eval.ts";
import { formatUsage, withLedger, type Usage } from "./llm.ts";
import { create, fix, iterate } from "./pipeline.ts";
import { formatReport, playtest, serve } from "./playtest.ts";
import { ensureVendor, readSpec } from "./template.ts";

const USAGE = `forge — vision in, playable game out

  forge new "<vision>"          design, build, playtest, repair until it ships
  forge iterate <dir> "<change>" apply a change request, then playtest/repair
  forge fix <dir>               playtest/repair an existing game
  forge eval                    build every vision in evals/visions.json and report
                                ship rate, rounds and cost (--only a,b  --limit n  --concurrency n)
  forge playtest <dir>          run the automated playtester only (no API calls)
  forge serve <dir>             play it at http://127.0.0.1:5173

options: --out <dir> (default ../games)  --rounds <n> (default 4)
         --engine phaser|three  --no-critic  --duration <ms> (default 8000)
         --headed  --port <n>`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: path.resolve(import.meta.dirname, "../../games") },
    rounds: { type: "string", default: "4" },
    engine: { type: "string" },
    "no-critic": { type: "boolean", default: false },
    duration: { type: "string", default: "8000" },
    headed: { type: "boolean", default: false },
    port: { type: "string", default: "5173" },
    only: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "1" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [cmd, a, b] = positionals;
const opts = { rounds: Number(values.rounds), critic: !values["no-critic"], durationMs: Number(values.duration) };
const done = ({ result, usage }: { result: { shipped: boolean }; usage: Usage }) => {
  console.log(`\nCost: ${formatUsage(usage)} (estimated)`);
  process.exitCode = result.shipped ? 0 : 1;
};

switch (values.help ? undefined : cmd) {
  case "new": {
    if (!a) throw new Error('usage: forge new "<vision>"');
    const engine = values.engine as "phaser" | "three" | undefined;
    const run = await withLedger(() => create(a, values.out!, { ...opts, engine }));
    const r = run.result;
    console.log(`\n${r.shipped ? "Shipped" : "Stopped"}: ${r.dir}\nPlay it: npm run forge -- serve ${r.dir}`);
    done(run);
    break;
  }
  case "iterate":
    if (!a || !b) throw new Error('usage: forge iterate <dir> "<change>"');
    done(await withLedger(() => iterate(a, b, opts)));
    break;
  case "fix":
    if (!a) throw new Error("usage: forge fix <dir>");
    done(await withLedger(() => fix(a, opts)));
    break;
  case "eval": {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const s = await runEvals({
      ...opts,
      file: path.resolve(import.meta.dirname, "../evals/visions.json"),
      out: path.resolve(import.meta.dirname, "../evals/runs", stamp),
      only: values.only?.split(","),
      limit: values.limit ? Number(values.limit) : undefined,
      concurrency: Number(values.concurrency),
    });
    console.log(`Report: harness/evals/runs/${stamp}/summary.md`);
    process.exitCode = s.shipped === s.games ? 0 : 1;
    break;
  }
  case "playtest": {
    if (!a) throw new Error("usage: forge playtest <dir>");
    const r = await playtest(a, { durationMs: opts.durationMs, headed: values.headed });
    console.log(formatReport(r));
    process.exitCode = r.passed ? 0 : 1;
    break;
  }
  case "serve": {
    if (!a) throw new Error("usage: forge serve <dir>");
    await ensureVendor(a, (await readSpec(a)).engine);
    await serve(a, Number(values.port));
    console.log(`Playing ${a} at http://127.0.0.1:${values.port}  (Ctrl+C to stop)`);
    break;
  }
  default:
    console.log(USAGE);
}
