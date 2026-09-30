# Forge log

Result: SHIPPED after 2 round(s)

Cost so far: 3 calls, in 7690 + cache write 62709 + cache read 48923, out 19890 tokens, ~$0.94 (estimated from list prices)

## Round 1

```
PASS  contract: __FORGE__.ready — ready
PASS  boots into menu — state=menu
PASS  startKey enters playing — after Enter: state=playing
FAIL  frame rate — 19 fps (headless, software GL)
PASS  renders a scene — distinct colors: menu=147 play=257
PASS  screen changes during play — 8.52% of sampled pixels changed
PASS  state stays valid — restarts after win/lose: 0
PASS  no runtime errors — clean console
=> playtest FAILED
```

## Round 2

```
PASS  contract: __FORGE__.ready — ready
PASS  boots into menu — state=menu
PASS  startKey enters playing — after Enter: state=playing
PASS  frame rate — 25 fps (headless, software GL)
PASS  renders a scene — distinct colors: menu=142 play=250
PASS  screen changes during play — 9.85% of sampled pixels changed
PASS  state stays valid — restarts after win/lose: 0
PASS  no runtime errors — clean console
=> playtest passed
```

Critic: **ship** — A polished, readable build that matches the design. The menu shows the title and 'Press Enter to start'. Enter moves the game into 'playing' with 150 gold, 20 lives, wave 1/10 and score 0. The winding sandy path has rounded corners and inner shadow, the spawn and exit gates glow, and the tiles have alternating shading. The HUD has coin and heart icons, and the bottom panel lists tower costs with their keys and a next-wave preview, which updated correctly to 'WAVE 2 MIXED x10 grunts x4 runners'. During play the build cursor tints red on an unaffordable tile and shows a Frost ghost and range circle. A Frost tower was placed and upgraded to level 2: gold went 150 → 80 → 27, which matches the 75% upgrade cost, and it shows extra spikes. Its hit shows '5' damage, consistent with the +60% bonus on 3 base damage. Enemies near it look slowed with a blue tint, and pause toggled correctly. The console is clean. No acceptance criterion is visibly broken, though the 8-second test only reached wave 1.

- [minor] Coverage gap: telemetry covers only the first ~8s of wave 1. The boss HP bar and screen shake, the win and lose transitions, restart from won/lost, and early-send bonus gold with floating text are unverified. A longer scripted run should confirm these before release.
- [minor] Score stayed at 0 for the whole sample even while an upgraded Frost tower was hitting grunts. This is probably just because no kill happened yet, but check that kills increment __FORGE__.score and spawn coin particles toward the gold HUD.
- [minor] The 'No tower here' feedback floats above the cursor in red, on top of a red range circle, and is hard to read against it. Consider adding a dark stroke or background, as the art direction specifies for text.
- [minor] On the menu, the HUD and bottom panel stay visible, dimmed, behind the title overlay. This is acceptable, but a slightly stronger dim or hiding the gameplay HUD would make the menu look more intentional.
