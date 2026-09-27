# Progress

**Current phase:** 0 — Harness MVP (see ROADMAP §2)

## Phase 0 gate
- [x] Pipeline: design → build → playtest → critic → repair
- [x] Automated playtester with the game contract, plus CI
- [x] Eval set of 25 varied visions (`harness/evals/visions.json`) and `forge eval` runner
- [x] Per-game token and cost tracking (`forge/usage.json`, `log.md`, eval summary)
- [ ] First real run with the API; record $/game and rounds
- [ ] ≥ 60% of eval visions ship with no human edits

## Now
- **Waiting on Sam:** add `ANTHROPIC_API_KEY` to the cloud environment (environment menu → Edit → environment variables), then start a new session.

## Next (once the key is in)
1. Smoke test: `forge new` on one easy vision. Check the output with human eyes and confirm the cost estimate matches the Console.
2. Baseline: `forge eval --limit 5`, then the full set. Record the numbers below.
3. Read every failure and group it by cause (contract, crash, visual, fun). Fix the biggest group first in prompts or playtester, then re-run. Repeat until ≥ 60%.
4. Tune cost: effort levels per stage, Sonnet 5 for the critic, Batch API for evals. Measure before and after.

## Next (no key needed)
1. Goal-directed playtest bot: plays to win using `__FORGE__` plus optional hint fields, not only random keys.
2. Multi-file builds (scenes/systems modules) for bigger games; raise the size limit.
3. `forge pack <dir>`: zip a game for itch.io upload.
4. SessionStart hook so fresh cloud sessions run `npm install` automatically.

## Phase 1 preview (after the gate)
Asset pipeline (2D art, SFX), a web studio (chat + live preview + iterate), nightly evals in CI, and a human "fun" rating panel. See ROADMAP §2.

## Eval results
| Date | Model | Games | Ship rate | Avg rounds | $/game | Notes |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | no real run yet |

## Blockers
- No API key in this environment, so the harness hasn't made a real API call yet.

## Done
- Harness v0, reference Pong, CI, roadmap (PR #1, merged)
- Neon Serpent demo game, hand-built to the contract and passing the playtester
- Eval set, `forge eval`, per-game cost ledger, offline pipeline tests with a mock API

## Log
- 2026-09-27: Wiped the SFML repo. Built harness v0, Pong and the roadmap. Added CLAUDE.md, PROGRESS and DECISIONS. Made the Neon Serpent demo.
- 2026-09-27: Added the 25-vision eval set, `forge eval`, cost tracking, slug sanitizing, and mock-API pipeline tests (8/8 passing). Blocked on the API key for real runs.
