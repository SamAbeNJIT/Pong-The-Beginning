# Forge — working notes for Claude

Forge turns a game idea into a playable, tested game. It will grow into a creator platform with rev share, then a storefront, then a game OS.

## Start of every session
1. Read `docs/PROGRESS.md` to see where we are, what's next and what's blocked.
2. Skim `docs/ROADMAP.md` for the current phase and its gate.
3. Check `docs/DECISIONS.md` before changing anything architectural.

## End of every session
- Update `docs/PROGRESS.md`: move items between Now, Next and Done, and add one line to the log.
- Add an entry to `docs/DECISIONS.md` for any real choice (what, why, alternatives).
- Only mark a phase gate as passed with evidence (numbers, eval runs), never on vibes.

## Commands (run from `harness/`)
```bash
npm install                                  # first time in a fresh container
npm run typecheck && npm test                # must pass before every push
npm run forge -- new "<vision>"              # needs ANTHROPIC_API_KEY
npm run forge -- eval --limit 5              # eval set -> harness/evals/runs/<time>/summary.md
npm run forge -- playtest ../games/<slug>    # no API calls
npm run forge -- serve ../games/<slug>
npm run forge -- new "<vision>" --profile quick|standard|deluxe
```

Forge Studio (run from `studio/`): `npm install`, `npm start`, `npm test` (core logic), `xvfb-run -a npm run e2e` (the real app against a mock API; on a Mac just `npm run e2e`), `npm run dist` (a Mac `.app`, only on a Mac).

## Layout
- `harness/src/` is the pipeline: `pipeline.ts` (design, then a per-game `Studio` thread for build and repairs, critic, convergence loop), `playtest.ts`, `prompts.ts` (holds the game contract), `llm.ts` (API calls + cost ledger), `eval.ts`, `spec.ts`, `files.ts`, `template.ts`.
- `harness/evals/visions.json` is the eval set. Record every real eval run in the PROGRESS results table.
- `games/<slug>/` holds one static game each. `forge/` inside it keeps the vision, spec, log and screenshots.
- `studio/` is Forge Studio, the Electron Mac app. `core.mjs` holds the logic and is tested without Electron. `main.mjs` handles windows, IPC and the Keychain-encrypted API key. `ui/` is the interface (no framework). The app runs the harness CLI as a child process with Electron's own Node (`ELECTRON_RUN_AS_NODE`) and reads `@@forge` JSON event lines (`harness/src/events.ts`).
- `harness/src/profiles.ts` defines the Quick, Standard and Deluxe harnesses. Deluxe adds the Fable 5.1 advisor tool to engineer turns.
- `docs/` holds the roadmap, progress and decisions.

## Rules
- The harness owns `index.html`, `vendor/` and `forge/`. Models only write game `.js`, `.json` and `.css` files.
- Every game follows the contract in `harness/src/prompts.ts`. A change to the contract means updating the playtester, the prompts and the tests together.
- Use one branch and one PR per task. Keep CI green.
- TypeScript ESM, `node:test`, and no new dependencies without a note in DECISIONS.

## Cost rules (see DECISIONS 010)
- Keep system prompts frozen: no timestamps, IDs or per-game text in them. Per-game content goes in messages.
- Keep a game's conversation append-only. Never edit or drop earlier turns, since that breaks the cache and Opus 5.5's thinking blocks.
- Repairs are `<edit>` blocks. If output tokens per repair climb, check that the model is still sending edits.
- Watch the `cache_read` numbers in the logs. If they're 0 on repair turns, caching is broken.

## Gotchas already hit
- The advisor tool must stay in `tools` for a whole thread once any turn used it. Removing it while the history holds advisor results is a 400, so it comes from the profile and is fixed per run.
- electron-builder skips `node_modules` inside `extraResources` unless it's its own entry (see `studio/package.json`).
- Electron on Linux as root needs `--no-sandbox`. The e2e test passes it.
- Pass strings, not arrow functions, to `page.evaluate`. tsx injects a `__name` helper that doesn't exist inside the page.
- A second browser tab backgrounds the game and throttles rAF, which reads as about 2 fps. Open the second tab only after measuring.
- In Phaser 3, readiness comes from `game.events` `POST_RENDER`, not the scene's events.
- three.js's `exports` map hides `build/`, so resolve the package root instead (see `template.ts`).
