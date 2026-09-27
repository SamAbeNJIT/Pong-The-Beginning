import { z } from "zod";

// The game design document the Designer produces from a free-text vision.
// Everything downstream (Builder, Playtester, Critic) works from this.
export const GameSpec = z.object({
  title: z.string(),
  slug: z.string().describe("kebab-case folder name, e.g. neon-snake"),
  pitch: z.string().describe("one sentence"),
  engine: z.enum(["phaser", "three"]).describe("phaser for 2D, three for 3D"),
  genre: z.string(),
  coreLoop: z.string().describe("what the player does every 10 seconds"),
  mechanics: z.array(z.string()),
  controls: z
    .array(z.object({ key: z.string(), action: z.string() }))
    .describe("key uses Playwright key names: ArrowLeft, Space, Enter, KeyW, ..."),
  startKey: z.string().describe("Playwright key name that starts the game from the menu"),
  winCondition: z.string(),
  loseCondition: z.string(),
  entities: z.array(z.object({ name: z.string(), description: z.string() })),
  artDirection: z.string().describe("procedural shapes/colors only, no external image files"),
  palette: z.array(z.string()).describe("hex colors"),
  audio: z.string().describe("WebAudio-synthesized sounds only"),
  difficulty: z.string(),
  outOfScope: z.array(z.string()).describe("features deliberately cut from this version"),
  acceptance: z.array(z.string()).describe("observable criteria a playtester can check"),
});
export type GameSpec = z.infer<typeof GameSpec>;

// What the Critic returns after looking at screenshots + playtest telemetry.
export const Critique = z.object({
  verdict: z.enum(["ship", "revise"]),
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["blocker", "major", "minor"]),
      description: z.string(),
    }),
  ),
});
export type Critique = z.infer<typeof Critique>;
