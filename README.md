# Forge

A player's vision goes in; a playable, tested game comes out. This repo holds the first piece of a platform for AI-built games with revenue share. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan (platform → storefront → game OS).

```
vision ─▶ Designer ─▶ spec.json ─▶ Builder ─▶ game.js
                                                │
             ┌──────────── repair ◀─────────────┤
             ▼                                  │
      Playtester (headless Chromium) ──pass──▶ Critic (screenshots + telemetry)
             │ fail                             │ revise │ ship
             └──────────▶ repair ◀──────────────┘        ▼
                                                    games/<slug>/
```

## Quickstart

```bash
cd harness
npm install
export ANTHROPIC_API_KEY=...                 # or: ant auth login

npm run forge -- new "a neon snake game where eating makes the music faster"
npm run forge -- serve ../games/<slug>       # play at http://127.0.0.1:5173
npm run forge -- iterate ../games/<slug> "add a dash on Shift and a combo meter"
npm run forge -- eval --limit 5              # build the eval set, report ship rate and $/game
npm run forge -- playtest ../games/pong      # playtester only, no API calls
npm test                                     # harness tests (needs Chromium)
```

Options: `--engine phaser|three`, `--rounds 4`, `--no-critic`, `--duration 8000`, `--headed`. The model defaults to `claude-opus-5`; set `FORGE_MODEL` to change it.

## How it works

| Stage | File | What it does |
|---|---|---|
| Design | `harness/src/pipeline.ts` | Turns the vision into a schema-validated `GameSpec` (`harness/src/spec.ts`): mechanics, controls, win/lose, art direction, cuts, acceptance criteria. |
| Build | `harness/src/pipeline.ts` | Writes the game as ES modules. The harness owns `index.html` and `vendor/`, so every game loads the same way. |
| Playtest | `harness/src/playtest.ts` | Boots the game headless and checks the contract: the game reports ready, the menu goes to playing, it runs at ≥ 24 fps, the screen renders and changes, and there are no console errors. It then plays with seeded random input and saves screenshots. |
| Critic | `harness/src/pipeline.ts` | A vision-model review of the screenshots and state timeline against the spec. The verdict is ship or revise. |
| Repair | `harness/src/pipeline.ts` | Rewrites the code using the failing checks, errors, screenshots and critic issues. This loops until the game ships or runs out of rounds. |

Each game folder keeps its own record in `forge/`: `vision.md`, `spec.json`, `playtest.json`, `log.md` and `screens/`.

### The game contract

Every game exposes `window.__FORGE__ = { ready, state, score }`, where `state` is one of `menu | playing | paused | won | lost`. It boots into `menu`, and the spec's `startKey` starts it. No network requests and no external assets: art is procedural and audio is WebAudio. With this contract, any game can be tested automatically without knowing anything about it. The full text is in `harness/src/prompts.ts`.

`games/pong/` (a nod to this repo's high-school origins) and `games/neon-serpent/` are reference games that pass the contract.

## Layout

```
harness/   the pipeline and CLI (TypeScript, Node ≥ 20)
games/     generated games; each folder is a static site you can deploy anywhere
docs/      roadmap and strategy
```
