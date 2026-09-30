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
1. Goal-directed playtest bot: plays to win using `__FORGE__` plus optional hint fields, not only random keys. Evidence it's needed: the critic sees only 8 seconds of random input, so it passed Tiny Bastion v1 even though a scripted bot showed it couldn't be lost. That bot (strategies played in-page with real gold, run through a captured `Phaser.Game`) found the balance problems, and its numbers drove two `iterate` passes. Generalize it: let a game expose `__FORGE__.bot` hooks and report balance per strategy.
2. Multi-file builds (scenes/systems modules) for bigger games; raise the size limit.
3. `forge pack <dir>`: zip a game for itch.io upload.
4. SessionStart hook so fresh cloud sessions run `npm install` automatically.

## Phase 1 preview (after the gate)
Asset pipeline (2D art, SFX), a web studio (chat + live preview + iterate), nightly evals in CI, and a human "fun" rating panel. See ROADMAP §2.

## Eval results
| Date | Model | Games | Ship rate | Avg rounds | $/game | Notes |
|---|---|---|---|---|---|---|
| 2026-09-30 | claude-opus-5-5 | 1 (smoke) | 1/1 | 4 | $2.14 | Gusty Descent. Rounds 1–2 failed fps (12, 17). Critic asked for one revise. Build turn $1.10; repairs read 57–66k cached tokens. 11m57s. |
| 2026-09-30 | claude-opus-5-5 | 1 (Tiny Bastion) | 1/1 | 2 | $3.47 | Build turn wrote 98k tokens (over the old 64k cap). An earlier try at build effort `xhigh` hit the 128k cap and was lost (~$2.70), which led to DECISIONS 012. Two `iterate` balance passes followed ($0.94 + $0.71). |

## Blockers
- No `ANTHROPIC_API_KEY` in the environment settings; the smoke run used a key pasted into chat (rotate it).

## Done
- Harness v0, reference Pong, CI, roadmap (PR #1, merged)
- Neon Serpent demo game, hand-built to the contract and passing the playtester
- Eval set, `forge eval`, per-game cost ledger, offline pipeline tests with a mock API
- Opus 5.5, per-stage effort, one cached conversation per game, `<edit>` repairs (DECISIONS 010)
- First real game: `games/gusty-descent` (lunar lander), shipped by the harness with no human edits
- `games/tiny-bastion` (tower defense), shipped by the harness, then two balance passes via `forge iterate`. Balance bot results: solid play wins 15/20, rushing every wave wins 10/20, 3 idle towers lose at wave 9.
- `max_tokens` raised to 128k, cut-off builds continue in the thread, fps hint in the engineer prompt (DECISIONS 011–012)
- Tiny Bastion now has 4 maps (Meadow Run, Switchback, Crossroads, Twin Gates) with level select and unlocks, added through `forge iterate`. Change requests now override the design for the critic (DECISIONS 013).

## Log
- 2026-09-27: Wiped the SFML repo. Built harness v0, Pong and the roadmap. Added CLAUDE.md, PROGRESS and DECISIONS. Made the Neon Serpent demo.
- 2026-09-27: Added the 25-vision eval set, `forge eval`, cost tracking, slug sanitizing, and mock-API pipeline tests (8/8 passing). Blocked on the API key for real runs.
- 2026-09-30: Moved to Opus 5.5 with prompt caching and edit-based repairs. First real run: Gusty Descent shipped in 4 rounds for ~$2.14.
- 2026-09-30: Tiny Bastion built ($3.47, plus ~$2.70 lost to an `xhigh` build that hit the output cap). A balance bot showed v1 was unlosable; two `iterate` passes fixed rushing and tightened the endgame. Added cut-off continuation and 128k output.
- 2026-09-30: Added 3 maps to Tiny Bastion (~$2.07; the iterate rewrote game.js whole, 77k output tokens). The critic flagged the requested maps as out of scope, so approved changes now override the design. The game's self-test passes 35/35. Sam does QA for now.
