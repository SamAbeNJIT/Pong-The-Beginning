// Neon Serpent — the snake steps on every eighth note, so faster music = faster snake.
const CELL = 32;
const COLS = 30;
const ROWS = 20;
const W = COLS * CELL;
const H = ROWS * CELL;
const WIN = 30;
const BPM_START = 96;
const BPM_STEP = 6;
const BPM_MAX = 276;
const C = { bg: 0x07060f, grid: 0x1d1a3d, head: 0x22d3ee, tail: 0xa78bfa, orb: 0xf472b6, text: "#e2e8f0" };
const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const KEYMAP = { UP: "up", W: "up", DOWN: "down", S: "down", LEFT: "left", A: "left", RIGHT: "right", D: "right" };
const ARP = [0, 3, 7, 10, 12, 10, 7, 3]; // minor-7 arpeggio, semitones over the root

const forge = (window.__FORGE__ = { ready: false, state: "menu", score: 0, level: 1 });

// ---------- audio (lazy, synthesized) ----------
let ac;
function audio() {
  if (!ac) ac = new AudioContext();
  return ac;
}
function tone({ freq, type = "square", dur = 0.08, vol = 0.05, slide = 0 }) {
  const a = audio();
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur = 0.4, vol = 0.12) {
  const a = audio();
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(a.destination);
  src.start();
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------- scene ----------
class Serpent extends Phaser.Scene {
  create() {
    // static grid drawn once; only its alpha pulses with the beat
    this.grid = this.add.graphics();
    this.grid.lineStyle(1, C.grid, 1);
    for (let x = 0; x <= COLS; x++) this.grid.lineBetween(x * CELL, 0, x * CELL, H);
    for (let y = 0; y <= ROWS; y++) this.grid.lineBetween(0, y * CELL, W, y * CELL);
    this.grid.lineStyle(3, C.tail, 1).strokeRect(1, 1, W - 2, H - 2);
    this.g = this.add.graphics();
    this.fx = this.add.particles(0, 0, "__WHITE", {
      speed: { min: 80, max: 260 }, lifespan: 450, scale: { start: 2.5, end: 0 },
      tint: [C.orb, C.head, C.tail], blendMode: "ADD", emitting: false,
    });
    this.panel = this.add.rectangle(W / 2, H / 2 - 10, 640, 230, C.bg, 0.95).setStrokeStyle(2, C.tail, 0.6).setDepth(9);
    const font = { fontFamily: "monospace", color: C.text };
    this.hud = this.add.text(16, 12, "", { ...font, fontSize: "20px" }).setDepth(10);
    this.title = this.add.text(W / 2, H / 2 - 50, "", { ...font, fontSize: "60px" }).setOrigin(0.5).setDepth(10);
    this.sub = this.add.text(W / 2, H / 2 + 30, "", { ...font, fontSize: "22px", color: "#94a3b8", align: "center" }).setOrigin(0.5).setDepth(10);
    this.title.setShadow(0, 0, "#22d3ee", 18, true, true);

    this.input.keyboard.on("keydown", (e) => this.onKey(e));
    this.scale.on("resize", () => this.cameras.main.centerOn(W / 2, H / 2));

    this.pulse = 0;
    this.reset();
    this.showBanner("NEON SERPENT", "Press SPACE to start\nArrows / WASD to steer");
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => (forge.ready = true));
  }

  reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.dir = DIRS.right;
    this.queue = [];
    this.bpm = BPM_START;
    this.step = 0;
    this.acc = 0;
    this.score = 0;
    this.spawnOrb();
    this.syncForge();
  }

  syncForge() {
    forge.score = this.score;
    forge.level = 1 + Math.floor((this.bpm - BPM_START) / (BPM_STEP * 5));
    this.hud.setText(`SCORE ${this.score}/${WIN}   ${Math.round(this.bpm)} BPM`);
  }

  showBanner(title, sub) {
    this.panel.setVisible(true);
    this.title.setText(title).setVisible(true);
    this.sub.setText(sub).setVisible(true);
  }

  onKey(e) {
    if (e.code === "Space") {
      if (forge.state !== "playing") this.start();
      return;
    }
    const name = KEYMAP[e.key.length === 1 ? e.key.toUpperCase() : e.key.replace("Arrow", "").toUpperCase()];
    if (!name || forge.state !== "playing") return;
    const d = DIRS[name];
    const last = this.queue.at(-1) ?? this.dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return; // no reversing into yourself
    if (this.queue.length < 2) this.queue.push(d);
  }

  start() {
    audio().resume();
    this.reset();
    this.panel.setVisible(false);
    this.title.setVisible(false);
    this.sub.setVisible(false);
    forge.state = "playing";
    tone({ freq: midi(69), dur: 0.15, vol: 0.06, slide: 2 });
  }

  spawnOrb() {
    const taken = new Set(this.snake.map((s) => s.x + "," + s.y));
    let x, y;
    do {
      x = Phaser.Math.Between(1, COLS - 2);
      y = Phaser.Math.Between(1, ROWS - 2);
    } while (taken.has(x + "," + y));
    this.orb = { x, y };
  }

  tick() {
    // music: one arp note per step, kick on every beat (2 steps)
    const root = 45 + Math.min(12, Math.floor(this.score / 5) * 2);
    tone({ freq: midi(root + 12 + ARP[this.step % ARP.length]), dur: 0.07, vol: 0.035 });
    if (this.step % 2 === 0) {
      tone({ freq: 140, type: "sine", dur: 0.12, vol: 0.18, slide: 0.3 });
      this.pulse = 1;
    }
    this.step++;

    if (this.queue.length) this.dir = this.queue.shift();
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    const ate = head.x === this.orb.x && head.y === this.orb.y;
    const body = ate ? this.snake : this.snake.slice(0, -1);
    const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
    if (hitWall || body.some((s) => s.x === head.x && s.y === head.y)) return this.die();

    this.snake.unshift(head);
    if (!ate) this.snake.pop();
    else this.eat();
  }

  eat() {
    this.score++;
    this.bpm = Math.min(BPM_MAX, this.bpm + BPM_STEP);
    this.fx.explode(24, this.orb.x * CELL + CELL / 2, this.orb.y * CELL + CELL / 2);
    this.cameras.main.flash(80, 244, 114, 182, false);
    tone({ freq: midi(81 + (this.score % 5)), dur: 0.12, vol: 0.06, slide: 1.5 });
    this.syncForge();
    if (this.score >= WIN) {
      forge.state = "won";
      this.showBanner("YOU WIN", `Survived to ${Math.round(this.bpm)} BPM\nPress SPACE to play again`);
      return;
    }
    this.spawnOrb();
  }

  die() {
    forge.state = "lost";
    noise();
    tone({ freq: 220, dur: 0.6, vol: 0.08, slide: 0.25, type: "sawtooth" });
    this.cameras.main.shake(260, 0.012);
    this.showBanner("GAME OVER", `Score ${this.score}  ·  ${Math.round(this.bpm)} BPM\nPress SPACE to try again`);
  }

  update(_, dtMs) {
    if (forge.state === "playing") {
      this.acc += dtMs;
      const stepMs = 60000 / this.bpm / 2; // eighth notes
      while (this.acc >= stepMs && forge.state === "playing") {
        this.acc -= stepMs;
        this.tick();
      }
    }
    this.pulse = Math.max(0, this.pulse - dtMs / 250);
    this.draw();
  }

  draw() {
    const g = this.g;
    const t = this.time.now / 1000;
    g.clear();

    this.grid.setAlpha(0.55 + this.pulse * 0.45); // grid pulses on the beat

    // orb with glow
    const ox = this.orb.x * CELL + CELL / 2;
    const oy = this.orb.y * CELL + CELL / 2;
    const r = 9 + Math.sin(t * 8) * 2;
    for (let i = 3; i >= 1; i--) g.fillStyle(C.orb, 0.12).fillCircle(ox, oy, r + i * 6);
    g.fillStyle(C.orb, 1).fillCircle(ox, oy, r);

    // serpent: gradient from head to tail, glow underneath
    const n = this.snake.length;
    this.snake.forEach((s, i) => {
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(C.head), Phaser.Display.Color.ValueToColor(C.tail), Math.max(1, n - 1), i,
      );
      const c = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
      const pad = i === 0 ? 1 : 3;
      g.fillStyle(c, 0.15).fillRect(s.x * CELL - 4, s.y * CELL - 4, CELL + 8, CELL + 8);
      g.fillStyle(c, 1).fillRoundedRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
    });

    // eyes point where we're heading
    const h = this.snake[0];
    const ex = h.x * CELL + CELL / 2 + this.dir.x * 6;
    const ey = h.y * CELL + CELL / 2 + this.dir.y * 6;
    g.fillStyle(C.bg, 1);
    g.fillCircle(ex + this.dir.y * 6, ey + this.dir.x * 6, 3);
    g.fillCircle(ex - this.dir.y * 6, ey - this.dir.x * 6, 3);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: C.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Serpent,
});
