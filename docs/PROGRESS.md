# Progress

**Current phase:** 0 — Harness MVP (see ROADMAP §2)

## Phase 0 gate
- [x] Pipeline: design → build → playtest → critic → repair
- [x] Automated playtester with the game contract, plus CI
- [x] Eval set of 25 varied visions (`harness/evals/visions.json`) and `forge eval` runner
- [x] Per-game token and cost tracking (`forge/usage.json`, `log.md`, eval summary)
- [x] First real run with the API; record $/game and rounds (Gusty Descent: shipped, 4 rounds, ~$2.14)
- [ ] ≥ 60% of eval visions ship with no human edits

## Now
- Baseline eval: `forge eval --limit 5` (~$10), then the full 25 (~$50). Waiting on Sam's go-ahead to spend.

## Next (API key needed)
1. Confirm the ledger's cost estimate matches the Console for the smoke run.
2. Baseline: `forge eval --limit 5`, then the full set. Record the numbers below.
3. Read every failure and group it by cause (contract, crash, visual, fun). Fix the biggest group first in prompts or playtester, then re-run. Repeat until ≥ 60%.
4. Tune cost: the build turn is ~half of $/game (53k output tokens). Try build effort medium, Sonnet 5 for the critic, Batch API for evals. Measure before and after.
5. Playtest fps check: headless software GL read 12–17 fps on a canvas-heavy game and cost two repair rounds. Decide whether the threshold or the renderer is wrong.

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
| 2026-09-30 | claude-opus-5-5 | 1 (smoke) | 1/1 | 4 | $2.14 | Gusty Descent. Rounds 1–2 failed fps (12, 17). Critic asked for one revise. Build turn $1.10; repairs read 57–66k cached tokens. 11m57s. |

## Blockers
- No `ANTHROPIC_API_KEY` in the environment settings; the smoke run used a key pasted into chat (rotate it).

## Done
- Harness v0, reference Pong, CI, roadmap (PR #1, merged)
- Neon Serpent demo game, hand-built to the contract and passing the playtester
- Eval set, `forge eval`, per-game cost ledger, offline pipeline tests with a mock API
- Opus 5.5, per-stage effort, one cached conversation per game, `<edit>` repairs (DECISIONS 010)
- First real game: `games/gusty-descent` (lunar lander), shipped by the harness with no human edits

## Log
- 2026-09-27: Wiped the SFML repo. Built harness v0, Pong and the roadmap. Added CLAUDE.md, PROGRESS and DECISIONS. Made the Neon Serpent demo.
- 2026-09-27: Added the 25-vision eval set, `forge eval`, cost tracking, slug sanitizing, and mock-API pipeline tests (8/8 passing). Blocked on the API key for real runs.
- 2026-09-30: Moved to Opus 5.5 with prompt caching and edit-based repairs. First real run: Gusty Descent shipped in 4 rounds for ~$2.14.
