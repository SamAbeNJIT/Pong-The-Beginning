# Forge: strategy and roadmap

**Goal:** a platform where anyone turns a game idea into a shipped, sellable game with revenue share. Later it adds a storefront, and eventually a game-optimized OS.

**Order of work:** generation quality first, then the creator platform, then distribution, then the OS. Each phase pays for the next one. Don't start a phase until the previous phase has passed its gate.

---

## 1. Core thesis

1. **The moat is verification, not generation.** Models get better every quarter, and competitors use the same ones. What compounds is the loop that proves a game works: automated playtesting, critics, evals and telemetry. That loop decides whether a generated game can ship. This repo starts there (`harness/src/playtest.ts`).
2. **Pick engines agents can drive as text.** Use web (Phaser, three.js) now, Godot 4 for mid-size and native games, and Unreal only for AAA-looking work.
   - Godot suits agents: scenes are text (`.tscn`), it exports headless from the CLI, it is MIT-licensed, and MCP servers already exist.
   - Unity and Unreal can be driven through MCP, but their editors are heavy and hard to run headless at scale.
3. **Reach buyers on existing stores first.** Export to itch.io, Steam, Poki, CrazyGames and Discord Activities before building your own store. Your store becomes worth having once you have creators and catalog.
4. **Don't write a kernel.** A "game OS" today means immutable Linux + gamescope + Proton + a controller-first shell. Assemble it; don't build it.
5. **AAA by prompt is a long way off.** The realistic big-game play is an *AI studio* that makes small teams 10× faster: multi-agent roles, persistent project memory, human direction. It is not "type GTA, get GTA".

## 2. Phases and gates

| Phase | When | Build | Gate to move on |
|---|---|---|---|
| **0. Harness MVP** *(this repo)* | Weeks 0–4 | Vision → design → build → headless playtest → critic → repair. 2D (Phaser) and simple 3D (three.js). | An eval set of 25 varied visions. At least 60% ship with no human edits. Cost and time per game measured. |
| **1. Quality** | Months 1–3 | Multi-file projects. Asset pipeline (2D art, 3D models, SFX and music). Goal-directed playtest bots (computer use plus the state API). A web studio with chat and live preview. Nightly evals in CI. | Ship rate ≥ 85% on 100 visions. Human "fun" score ≥ 3.5/5 on a blind panel. |
| **2. Creator platform** | Months 3–6 | Accounts, hosting, versioning, remix/fork, analytics. Multiplayer templates. Ads and IAP. Rev-share ledger. One-click publish to itch.io, Poki, CrazyGames and Discord. | 1k monthly creators. 100 games with D7 retention ≥ 10%. First revenue paid out. |
| **3. Native and storefront beta** | Months 6–12 | Godot backend (desktop/mobile builds, Steam export). Multi-agent studio (designer, programmer, artist, QA, producer). Storefront beta with merchant of record, IARC ratings, moderation, AI disclosure, refunds and fraud controls. | Store GMV that covers infra costs. Payment disputes < 1%. |
| **4. Large games** | Year 2 | Persistent project memory and a module architecture that lets agents work on 100k+ line codebases. Asset streaming and LOD. Unreal integration. Dedicated servers and MMO backend. | A studio ships a mid-size commercial game built mainly with the platform. |
| **5. Game OS** | Year 2–3+ | An immutable Linux image (Fedora Atomic / Bazzite-style or Arch / SteamOS-style) with gamescope, Proton, your launcher as the shell, cloud saves and store integration. Ship on handhelds and mini-PCs through OEM partners. | OEM deal or 10k installs. |

## 3. Recommended stack

| Layer | Now | Later |
|---|---|---|
| **Models** | Claude Opus 5.5 for design, build, repair and critic (adaptive thinking, explicit effort per stage). | Route cheap work (critics, bulk asset tagging) to Sonnet 5 or Haiku 4.5. Use the Batch API for nightly evals (50% cheaper). |
| **Agent runtime** | A deterministic pipeline on the Claude API (`harness/src/pipeline.ts`). Easy to test and cheap to debug. | **Claude Agent SDK** for open-ended multi-file agents (built-in file and bash tools, subagents, hooks, MCP). **Claude Managed Agents** for hosted per-game sandboxes at scale, with rubric-graded outcomes. |
| **Engines** | Phaser 3.90 (2D) and three.js r186 (3D), vendored. | Godot 4.x through its headless CLI and a Godot MCP server. Unreal 5.7 through Python/Remote Control MCP for AAA visuals. |
| **Playtesting** | Playwright plus Chromium: contract checks, seeded input fuzzing, screenshots, fps. | Goal-directed agents that play to win (computer use plus the `__FORGE__` state API). Godot headless tests. Crash telemetry through Sentry. |
| **Assets** | Procedural only (shapes, synthesized audio). | 2D: Scenario or Layer.ai (per-game style training). 3D: Meshy, Tripo or Rodin (with auto-rig). SFX and music: ElevenLabs. Multi-asset: Ludo.ai (API and MCP). Avoid Suno until it has an official API. |
| **Evals** | Your own vision set plus ship rate, rounds, $/game. | Also track public benchmarks (V-GameGym, GameCraft-Bench) so you can make comparable claims. |
| **Infra** | Static hosting on Cloudflare Pages/R2. | Workers or Durable Objects for light multiplayer. Nakama or Colyseus for game backends. Agones (Kubernetes) for dedicated servers. Temporal or Inngest for long build pipelines. Postgres. |
| **Money** | — | Stripe Connect for creator payouts and KYC. For merchant of record: Paddle, Xsolla (games-focused, ~5%) or Stripe Managed Payments. |
| **Compliance** | — | IARC (license it and embed the questionnaire in onboarding). COPPA and age gating. DMCA. Steam-style AI-content disclosure. IP-similarity filters ("make me GTA" requests). |

## 4. Rev share: the market you're pricing against

| Platform | Creator gets |
|---|---|
| Steam | 70% (75% above $10M, 80% above $50M), plus a $100 fee per game |
| Epic Games Store | 100% of the first $1M per app per year, then 88% |
| itch.io | 90% by default; the creator can set 0–100% |
| Roblox | About $0.0038 per Robux through DevEx (higher rate for verified 18+ US spend) |
| Fortnite UEFN | Engagement payouts, plus 100% of in-island V-Bucks through Jan 2027 |
| Poki | 50% (100% on traffic the creator brings) |

**Suggested offer:** creators keep 85–90% of store sales. The platform earns on generation credits and compute rather than a big store cut. The pitch: "idea to revenue in a day, and you own the export."

## 5. Project management and agentic workflow

- **Tracking.** GitHub Projects is enough while you're solo. Move to **Linear** once there's a team; it has an official MCP server, so agents can read and close tickets. Use two-week cycles, with one gate metric per phase shown on the board.
- **Build the platform with agents.** Use Claude Code in parallel cloud sessions, one ticket → one branch → one PR each. CI and Claude code review gate every merge. Keep a `CLAUDE.md` with conventions. Run a nightly scheduled routine for the eval suite.
- **Eval-driven development is the main habit.** Every prompt or pipeline change gets measured on the vision set: ship rate, average rounds, $/game and critic score. A change that doesn't move a number doesn't merge.
- **First hires,** in order: an engine/graphics engineer (Godot and rendering), a platform/backend engineer, a trust & safety and payments lead (before the storefront), and a developer-relations person for creators.

## 6. Competition

| Competitor | What they do |
|---|---|
| Astrocade | Prompt-to-game consumer platform; $56M raised, ~20M users |
| Rosebud | Prompt to browser game, with Pro code export |
| Roblox | Cube 4D generation, a Studio MCP, agentic Studio features |
| Unity AI and Bezi | Assistants inside the Unity editor |
| Google Genie 3 | Impressive world model, but a 60s demo with no API; not a shippable game |

**Where to be different:** games you can export and own, published to many stores, with rev share. Aim at real, sellable games rather than walled-garden UGC.

## 7. Risks, stated plainly

- **Quality ceiling.** Generated games are often playable but not fun. Invest early in critics, human rating and templates.
- **Unit economics.** A generation costs real tokens. Measure $/shipped game from day one (the harness logs token usage for every call).
- **Storefront load.** Payments, fraud, chargebacks, ratings and moderation are a company in themselves. Delay your own store until the catalog justifies it.
- **OS.** Valve now ships SteamOS on third-party hardware and sells its own Steam Machine (June 2026), and kernel anti-cheat still blocks many titles on Linux. Position the OS as "the console for this store", not a general-purpose OS.
- **IP and safety.** Users will ask for clones of famous games and for unsafe content. Plan similarity checks, moderation and model refusal handling (the harness already enables server-side refusal fallbacks).

*Market figures were checked in September 2026 from public sources. The CrazyGames and Discord Activities splits couldn't be verified, so they're left out.*
