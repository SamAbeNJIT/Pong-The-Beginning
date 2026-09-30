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
