// Harness profiles: preset trade-offs between cost, time and polish. The CLI takes
// --profile and Forge Studio shows them as choices. Estimates are from real runs.

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Stage = "design" | "build" | "repair" | "critic";

export type Profile = {
  id: string;
  name: string;
  blurb: string;
  estimate: string;
  rounds: number;
  effort: Record<Stage, Effort>;
  /** A stronger model the engineer consults mid-turn (the advisor tool). */
  advisor?: { model: string; maxUses: number; maxTokens: number };
};

export const PROFILES: Record<string, Profile> = {
  quick: {
    id: "quick",
    name: "Quick",
    blurb: "A fast first draft with lighter thinking and fewer fix rounds.",
    estimate: "about $1–2 · 10 min",
    rounds: 2,
    effort: { design: "low", build: "medium", repair: "medium", critic: "low" },
  },
  standard: {
    id: "standard",
    name: "Standard",
    blurb: "Opus 5.5 builds it, then tests and fixes it until the reviewer signs off.",
    estimate: "about $2–4 · 15–20 min",
    rounds: 4,
    effort: { design: "medium", build: "high", repair: "medium", critic: "medium" },
  },
  deluxe: {
    id: "deluxe",
    name: "Deluxe",
    blurb: "Like Standard, plus Claude Fable 5.1 as an advisor on the plan and on hard fixes, and more fix rounds.",
    estimate: "about $4–7 · 20–30 min",
    rounds: 6,
    effort: { design: "medium", build: "high", repair: "medium", critic: "medium" },
    advisor: { model: "claude-fable-5-1", maxUses: 2, maxTokens: 8000 },
  },
};

export function getProfile(id = "standard"): Profile {
  const p = PROFILES[id];
  if (!p) throw new Error(`unknown profile "${id}" (choose ${Object.keys(PROFILES).join(", ")})`);
  return p;
}
