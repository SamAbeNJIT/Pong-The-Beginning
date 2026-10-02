# Decisions

Newest entries go at the bottom. Format: what we decided, why, and what else we considered.

**001 · Web engines first (Phaser 3.90, three.js r186).** Games play instantly, deploy for free and test headlessly. Next step up is Godot 4, and Unreal only for AAA-scale later. *Alternatives:* Unity and Unreal now (too heavy to run headless at scale).

**002 · Our own deterministic pipeline on the Claude API.** It's easy to test, cheap to debug, and every stage is explicit. *Alternatives:* Claude Agent SDK (planned for open-ended multi-file agents) and Managed Agents (for hosted scale).

**003 · The harness owns index.html and vendor/, and games follow the `__FORGE__` contract.** This lets us playtest any game automatically without knowing anything about it.

**004 · Phaser 3.90 rather than Phaser 4.** Models have far more Phaser 3 training data, so generated code is more reliable. Revisit once v4 is widely known.

**005 · Default model `claude-opus-5`, overridable with `FORGE_MODEL`.** Uses adaptive thinking, xhigh effort for build and repair, and server-side refusal fallbacks.

**006 · Procedural art and synthesized audio only in v0.** No asset pipeline yet, and it removes loading failures. Asset APIs come in Phase 1.

**007 · "Shipped" means shipped with no human edits.** A game counts only if the playtest passes and the critic says ship within the round limit. Cost is estimated from token usage × list price per game (`forge/usage.json`), so the numbers stay comparable across runs. *Alternatives:* human-rated only (too slow for a daily loop; that comes in Phase 1 as a second metric).

**008 · Offline pipeline tests against a mock Messages API.** CI covers design → build → repair → critic → eval without a key or network, which catches plumbing regressions for free. Real-model quality lives in `forge eval`, not in CI.

**009 · Default model is now `claude-opus-5-5` (Claude Opus 5.5), replacing 005's `claude-opus-5`.** Requested by Sam. It is cheaper ($4/$20 per MTok vs $5/$25) and stronger per effort level. The harness already meets its requirements: adaptive thinking (always on), explicit effort per stage, no forced tool use, and `fallbacks: "default"` for classifier refusals. Effort levels are unchanged for now; tune them with `forge eval` (Opus 5.5 at `medium` is reported to beat Opus 5 at `high`).

**010 · Cost design: one cached conversation per game, edits instead of rewrites, lower effort.**
- **One cached thread per game.** Build and every repair are turns of one append-only conversation under one frozen engineer prompt. The system prompt has an explicit 1-hour cache breakpoint, and automatic 1-hour caching covers the growing thread, so later turns re-read the design and all earlier code at the cache-read price ($0.20/MTok on Opus 5.5 instead of $4) and the source isn't resent.
- **1-hour TTL.** A build or repair can generate for several minutes, which would expire a 5-minute entry before the next turn.
- **Edits, not rewrites.** Repairs reply with find/replace `<edit>` blocks. Output tokens are 5× the price of input, and a full-file rewrite was the single largest cost. An edit that fails to apply is reported next turn with the file's current contents.
- **One-shot calls aren't auto-cached.** Design and critic calls end in unique content, so auto-caching would only add the 1.25× write surcharge. They keep only the cached system prompt.
- **Effort.** Design, repair and critic run at `medium` and build at `high` (from high/xhigh/xhigh/high). Each stage can be overridden with `FORGE_EFFORT_<STAGE>` for sweeps.
- *Alternatives:* the Batch API (50% off) for eval runs is still open. It doesn't fit the interactive playtest loop, so it's only worth adding if eval spend becomes the main cost.

**011 · Room to build bigger games, and a frame-rate hint for the engineer.**
- `max_tokens` goes from 64k to 128k, the Opus 5.5 ceiling. The lunar lander build used 53k at `high`, so a richer game would hit the cap and fail the run. Billing is by tokens actually used, so the higher ceiling costs nothing by itself.
- The engineer prompt now says the playtest runs on software WebGL with a 24 fps floor, and how to stay under it. Two of the lander's four rounds went to fps fixes (12 and 17 fps), and each wasted round costs a repair call plus a playtest. Measure it by counting fps failures across the next runs.
- *Alternatives:* lowering the fps floor or measuring with GPU rendering. Both would hide real slowness that players on weak machines would see.


**012 · Continue a cut-off build instead of failing the run.** The first Tiny Bastion build ran at `xhigh` and spent the whole 128k output ceiling (about $2.60) before finishing, and the harness threw that output away. Now a reply cut off at `max_tokens` stays in the thread, and the engineer is asked to continue (up to two times). Replies are parsed one at a time, so a file cut off in one reply and resent whole in the next is taken from the resend. A cut inside thinking can't be continued, since the API won't accept an unsigned thinking block back; that still fails, and the error names the effort override. Usage is now recorded before a reply is rejected, so cut-off replies and refusals show up in the cost ledger. Build effort stays at `high`: `xhigh` blew the ceiling on the first real try. *Alternatives:* asking for multi-file output up front (it doesn't cut total tokens) or a task budget (worth trying if cut-offs recur).

**013 · Approved change requests override the design.** `forge iterate` now saves each request in the game's `forge/changes.md`. The critic, and any later resumed thread, gets them in an `<approved_changes>` block that overrides `spec.json`, including its outOfScope list. Before this, the critic judged Tiny Bastion's new maps against the original design, which listed "multiple maps" as out of scope, and started a repair to remove them. I stopped that run before the repair landed. *Alternatives:* rewriting `spec.json` for each change (it loses the original design and can't be audited) or letting the designer re-plan the spec (costs a call, and the redesign could drift from what the player asked for).

**014 · Forge Studio is an Electron app that drives the harness CLI.** Sam wanted a Mac app on an M1 where he can describe a game, have it built, and play it locally.
- **Electron.** The harness is Node and drives Chromium, so Electron shares the same runtime and needs no second language.
- **One runtime.** The app spawns the harness with its own Node binary (`ELECTRON_RUN_AS_NODE=1`, `--import tsx`), so the packaged app needs no Node install.
- **Event stream.** Progress comes back as `@@forge` JSON lines next to the human log.
- **API key.** It's encrypted with `safeStorage` (the macOS Keychain) and passed to the child through the environment, never argv. If encryption isn't available, the key lives only in memory for the session.
- **Isolation.** The UI is sandboxed and has no Node access; a fixed preload API is the only bridge. Game windows are sandboxed too and locked to their local server.
- **Packaging.** `npm run dist` bundles the harness, its `node_modules` and the sample games into `Forge Studio.app`, unsigned for local use.
- **New dependencies.** `electron` and `electron-builder`, both dev dependencies of `studio/`.
- **Verification.** An end-to-end test drives the real app under xvfb with Playwright: library, play window, and a full build against a mock API. It passed both from source and as a packaged Linux build.
- *Alternatives:* a SwiftUI app with a WKWebView (needs Xcode, and a second language for the same work), Tauri (Rust toolchain; the harness still needs Node), or a local web page plus a launcher script (not a real app: no Dock icon, notifications or windows).

**015 · Harness profiles, and Fable 5.1 as an advisor rather than the builder.** The app offers Quick, Standard and Deluxe (`harness/src/profiles.ts`, `--profile`).
- **Deluxe.** It keeps Opus 5.5 as the executor and adds the advisor tool with `claude-fable-5-1`, at most 2 consultations per request with 8k tokens each, on engineer turns only. Fable costs 2.5× Opus 5.5 per token, so it's consulted on the plan and on hard fixes and doesn't write the code. Opus 5.5 can't be forced to call a tool, so the build and repair turns ask for the consultation in text.
- **Costs.** Advisor tokens come back as separate `advisor_message` entries in `usage.iterations` and are priced at Fable rates. A real call on 2026-10-01 confirmed the top-level usage is the executor's alone.
- **Pauses.** Server-side tool loops can stop with `pause_turn`. Those turns are resent as is (no new user message) and their text is joined.
- **Running total.** `usage.json` now keeps `totalUsd` across runs.
- **Unmeasured.** The cost-optimization guidance warns that an advisor can buy about what more effort buys. Deluxe needs an eval comparison against Standard at `xhigh` before it earns its price.
- *Alternatives:* Fable as the builder (2.5× the cost on the largest token stream) or more effort only (cheaper, but no second opinion on design mistakes).

**016 · Survive dropped connections: retries, a silence watchdog, and summarized thinking.**
- **What happened.** Sam's first build in Forge Studio died in the design step with `read ETIMEDOUT`. The stream went silent while the model thought, and the connection was cut. The SDK retries a request that fails to start, not a stream that dies midway, so the run crashed, and the app showed $0.00 because cost is only known when a step finishes.
- **Keep the stream busy.** Every request now asks for `thinking.display: "summarized"`, which is billed the same as the default (omitted) but streams thinking as it happens. Measured on Opus 5.5 at high effort: 41 thinking updates, with the longest gap 4.7 s. Before, a long think was minutes of silence.
- **Retry midway failures.** `send()` in `llm.ts` retries dropped connections, 5xx and 429 up to 3 times, waiting 5 s and then 15 s. If a stream has sent nothing for 120 s, it's aborted and retried. Bad requests and bad keys aren't retried. A dropped attempt may still be billed for what it generated, and the ledger can't see that.
- **Tell the person.** The harness emits `progress` (phase, file, lines written), `retry` and `error` events with plain-language messages. Studio shows "Writing game.js · N lines so far", a note after 45 s of silence, each retry, and a **Try again** button on failure. Games whose build stopped before any code are labelled "Not finished" instead of "Hand-built".
- *Alternatives:* a client-side read timeout only (it would still lose the run), TCP keep-alive tuning (not controllable through the SDK on every OS), or the Batch API (no live progress, wrong for an interactive app).

