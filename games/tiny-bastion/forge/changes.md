# Approved change requests

These override the design in spec.json.

## Change 1

Add 3 more levels (maps), for 4 in total. Each level is a different single-screen map with its own name, its own path shape and its own 10 waves, and each is harder than the last.

- Level 1 "Meadow Run": the current map and waves, unchanged.
- Level 2 "Switchback": a longer zig-zag path with tighter turns and less open space, so placement matters.
- Level 3 "Crossroads": the path crosses over itself once. Draw the crossing clearly as a bridge. Towers near the crossing can hit enemies on both passes.
- Level 4 "Twin Gates": two spawn gates whose lanes merge about halfway to the exit, so early on the player defends two lanes. Split each wave between the gates.

Difficulty: each level's waves start stronger than the previous level's (more enemies and higher HP), and the wave 10 boss gets tougher each level. Keep level 1's current balance.

Flow:
- Beating wave 10 on levels 1 to 3 shows a "Level complete" screen with the score and "Press Enter for the next level". Keep __FORGE__.state as "playing" during this screen. Gold, towers and lives reset for each level, and the score carries over.
- Beating level 4 is the full win (state "won").
- Losing on any level is "lost"; Enter then restarts from level 1.
- The menu lists the 4 levels with lock icons. Keys 1 to 4 on the menu pick any unlocked level, and Enter starts the highlighted one. Remember unlocks in localStorage, wrapped in try/catch so it still works when storage is blocked.
- The HUD shows the level name and number next to the wave.

State: __FORGE__.level reports the current map (1 to 4), and __FORGE__.wave reports the wave.

Keep the self-test passing. Extend it to load every map and check that each path is connected from every spawn to the exit and that no tower slot sits on a path tile.
