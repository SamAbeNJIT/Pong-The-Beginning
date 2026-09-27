#!/usr/bin/env -S npx tsx
import path from "node:path";
import { parseArgs } from "node:util";
import { converge, create, iterate } from "./pipeline.ts";
import { formatReport, playtest, serve } from "./playtest.ts";
import { ensureVendor, readSpec } from "./template.ts";

const USAGE = `forge — vision in, playable game out

  forge new "<vision>"          design, build, playtest, repair until it ships
  forge iterate <dir> "<change>" apply a change request, then playtest/repair
  forge fix <dir>               playtest/repair an existing game
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
    help: { type: "boolean", short: "h", default: false },
  },
});

const [cmd, a, b] = positionals;
const opts = { rounds: Number(values.rounds), critic: !values["no-critic"], durationMs: Number(values.duration) };
const done = (r: { shipped: boolean }) => (process.exitCode = r.shipped ? 0 : 1);

switch (values.help ? undefined : cmd) {
  case "new": {
    if (!a) throw new Error('usage: forge new "<vision>"');
    const engine = values.engine as "phaser" | "three" | undefined;
    const r = await create(a, values.out!, { ...opts, engine });
    console.log(`\n${r.shipped ? "Shipped" : "Stopped"}: ${r.dir}\nPlay it: npm run forge -- serve ${r.dir}`);
    done(r);
    break;
  }
  case "iterate":
    if (!a || !b) throw new Error('usage: forge iterate <dir> "<change>"');
    done(await iterate(a, b, opts));
    break;
  case "fix":
    if (!a) throw new Error("usage: forge fix <dir>");
    done(await converge(a, opts));
    break;
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
