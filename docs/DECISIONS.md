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
