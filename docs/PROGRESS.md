# Progress

**Current phase:** 0 — Harness MVP (see ROADMAP §2)

## Phase 0 gate
- [x] Pipeline: design → build → playtest → critic → repair
- [x] Automated playtester with the game contract, plus CI
- [ ] First real run with the API; record $/game and rounds
- [ ] Eval set of 25 varied visions (`harness/evals/`)
- [ ] ≥ 60% of eval visions ship with no human edits

## Now
- Get an `ANTHROPIC_API_KEY` into the cloud environment (secrets) so sessions can run `forge new`.

## Next
1. Eval set and a runner script that runs them all and reports ship rate, rounds, tokens and $.
2. Token/cost log per game in `forge/log.md`.
3. Goal-directed playtest bot that plays to win, not only random input.
4. Multi-file builds for bigger games.

## Blockers
- No API key in this environment, so the harness hasn't made a real API call yet.

## Done
- Harness v0, reference Pong, CI, roadmap (PR #1)
- Neon Serpent demo game, hand-built to the contract and passing the playtester

## Log
- 2026-09-27: Wiped the SFML repo. Built harness v0, Pong and the roadmap. Added CLAUDE.md, PROGRESS and DECISIONS. Made the Neon Serpent demo.
