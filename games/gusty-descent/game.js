// Gusty Descent — a gusty lunar lander (Phaser 3, procedural art + WebAudio)

const W = 1280, H = 720;
const RENDER_W = 960, RENDER_H = 540;
const DEG = Math.PI / 180;
const GRAVITY = 30;          // px/s²
const THRUST = 72;           // px/s² along facing
const ROT_SPEED = 130 * DEG; // rad/s
const MAX_TILT = 90 * DEG;
const BURN = 60;             // fuel units / s
const SAFE_VY = 40, SAFE_VX = 25, SAFE_TILT = 12;
const MAX_LEVEL = 5;
const START_LIVES = 3;

const C = {
  bg: 0x05060a, white: 0xe8ecf1, grey: 0x5a6270, slate: 0x2a2f3a,
  orange: 0xff9a2e, yellow: 0xffe066, green: 0x3ddc84, blue: 0x4aa8ff,
  magenta: 0xff4fd8, red: 0xff3b3b,
};
const HEX = (n) => '#' + n.toString(16).padStart(6, '0');
const FONT = '"Courier New", Courier, monospace';

// Lander hull in local coords (y down, angle 0 = nose up). Order is clockwise on screen.
// 0 top, 1 right shoulder, 2 right foot, 3 left foot, 4 left shoulder
const LS = 1.35; // lander scale
const HULL = [
  { x: 0, y: -18 }, { x: 13, y: 4 }, { x: 17, y: 15 }, { x: -17, y: 15 }, { x: -13, y: 4 },
].map((p) => ({ x: p.x * LS, y: p.y * LS }));
const FOOT_X = 17 * LS, FOOT_Y = 15 * LS;
const PAD_DEFS = [
  { mult: 1, w: 170, color: C.green },
  { mult: 2, w: 110, color: C.blue },
  { mult: 3, w: 72, color: C.magenta },
];

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

window.__FORGE__ = { ready: false, state: 'menu', score: 0, lives: START_LIVES, level: 1 };

// ---------------------------------------------------------------- terrain
function groundY(pts, x) {
  if (x <= pts[0].x) return pts[0].y;
  const last = pts[pts.length - 1];
  if (x >= last.x) return last.y;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m].x <= x) lo = m; else hi = m;
  }
  const a = pts[lo], b = pts[hi];
  const t = (x - a.x) / Math.max(0.0001, b.x - a.x);
  return a.y + (b.y - a.y) * t;
}

function insideHull(lx, ly) {
  for (let i = 0; i < HULL.length; i++) {
    const a = HULL[i], b = HULL[(i + 1) % HULL.length];
    const cr = (b.x - a.x) * (ly - a.y) - (b.y - a.y) * (lx - a.x);
    if (cr <= 0.5) return false;
  }
  return true;
}

function generateLevel(level) {
  const N = 128, step = W / N;
  const h = new Array(N + 1).fill(0);
  h[0] = rand(420, 620);
  h[N] = rand(420, 620);
  const rough = 150 + level * 12;
  const md = (a, b, r) => {
    if (b - a < 2) return;
    const m = (a + b) >> 1;
    h[m] = (h[a] + h[b]) / 2 + (Math.random() * 2 - 1) * r;
    md(a, m, r * 0.56);
    md(m, b, r * 0.56);
  };
  md(0, N, rough);
  for (let i = 0; i <= N; i++) h[i] = clamp(h[i], 360, 690);

  // three zones, shuffled
  const zoneW = (W - 120) / 3;
  const zones = [0, 1, 2];
  for (let i = zones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }
  const pads = PAD_DEFS.map((d, i) => {
    const zs = 60 + zones[i] * zoneW, ze = zs + zoneW;
    return { ...d, cx: rand(zs + d.w / 2 + 24, ze - d.w / 2 - 24) };
  });

  // the x3 pad sits in a walled pit or atop a spire
  const hard = pads[2];
  hard.mode = Math.random() < 0.5 ? 'valley' : 'peak';
  for (let i = 0; i <= N; i++) {
    const x = i * step;
    const dx = x - hard.cx;
    if (hard.mode === 'valley') {
      const g = Math.exp(-Math.pow(dx / 60, 2));
      const ring = Math.exp(-Math.pow((Math.abs(dx) - 90) / 32, 2));
      h[i] += 70 * g - 120 * ring;
    } else {
      const g = Math.exp(-Math.pow(dx / 70, 2));
      h[i] -= 160 * g;
    }
    h[i] = clamp(h[i], 300, 700);
  }

  const hAt = (x) => {
    const f = clamp(x / step, 0, N);
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    return h[i] + (h[i + 1] - h[i]) * t;
  };
  pads.forEach((p) => {
    p.x0 = Math.round(p.cx - p.w / 2);
    p.x1 = Math.round(p.cx + p.w / 2);
    let s = 0, n = 0;
    for (let x = p.x0; x <= p.x1; x += 4) { s += hAt(x); n++; }
    p.y = Math.round(clamp(s / n, 300, 690));
  });

  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = i * step;
    if (!pads.some((p) => x >= p.x0 - 3 && x <= p.x1 + 3)) pts.push({ x, y: h[i] });
  }
  pads.forEach((p) => { pts.push({ x: p.x0, y: p.y }, { x: p.x1, y: p.y }); });
  pts.sort((a, b) => a.x - b.x);

  return {
    level,
    pts,
    pads,
    start: { x: rand(160, W - 160), y: 190, vx: rand(-18, 18) },
    fuel: 1000 - 80 * (level - 1),
    maxWind: 8 + 6 * (level - 1),
  };
}

// ---------------------------------------------------------------- audio
class Sfx {
  constructor() { this.ctx = null; this.thrustOn = false; this.lastWind = -1; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);
    const len = Math.floor(c.sampleRate * 2);
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // thruster loop
    const ts = c.createBufferSource();
    ts.buffer = this.noise; ts.loop = true;
    const tf = c.createBiquadFilter();
    tf.type = 'lowpass'; tf.frequency.value = 700; tf.Q.value = 0.8;
    this.thrustGain = c.createGain(); this.thrustGain.gain.value = 0;
    ts.connect(tf); tf.connect(this.thrustGain); this.thrustGain.connect(this.master);
    ts.start();

    // ambient wind loop
    const ws = c.createBufferSource();
    ws.buffer = this.noise; ws.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 480; wf.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    ws.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
    ws.start(0, 0.7);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setThrust(on) {
    if (!this.ctx || on === this.thrustOn) return;
    this.thrustOn = on;
    this.thrustGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, on ? 0.03 : 0.06);
  }

  setWind(v) {
    if (!this.ctx || Math.abs(v - this.lastWind) < 0.005) return;
    this.lastWind = v;
    this.windGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  tone(f, dur, type = 'sine', vol = 0.2, delay = 0, f2 = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  gust(strength) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, t);
    f.frequency.linearRampToValueAtTime(900, t + 0.5);
    f.frequency.linearRampToValueAtTime(300, t + 1.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * strength + 0.01, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 1.5);
  }

  warn() { this.tone(880, 0.08, 'triangle', 0.09); this.tone(660, 0.1, 'triangle', 0.09, 0.1); }
  blip() { this.tone(660, 0.08, 'square', 0.12); this.tone(990, 0.1, 'square', 0.1, 0.07); }
  beep() { this.tone(1400, 0.06, 'square', 0.07); }
  chime() {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      this.tone(f, 0.55, 'sine', 0.25, i * 0.12);
      this.tone(f * 2, 0.35, 'triangle', 0.06, i * 0.12);
    });
  }
  crash() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(150, t + 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 1.1);
    this.tone(320, 0.7, 'square', 0.16, 0, 40);
    this.tone(90, 0.5, 'sine', 0.45, 0, 30);
  }
}

// ---------------------------------------------------------------- scene
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    this.sfx = new Sfx();
    this.t = 0;
    this.state = 'menu';
    this.phase = 'idle';
    this.score = 0; this.lives = START_LIVES; this.level = 1;
    this.ready = false;
    this.endToken = 0;
    this.isRetry = false;
    this.held = {};

    // render at reduced backing resolution; logical world stays 1280x720
    this.cameras.main.setZoom(RENDER_W / W);
    this.cameras.main.centerOn(W / 2, H / 2);

    this.makeStars();
    this.dustGfx = this.add.graphics().setDepth(0.5);
    this.terrainGfx = this.make.graphics({ x: 0, y: 0 }, false);
    this.terrainImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(1);
    this.terrainKey = 0;
    this.dyn = this.add.graphics().setDepth(2);
    this.hudGfx = this.add.graphics().setDepth(10);
    this.padLabels = [];
    this.particles = [];
    this.dust = [];
    for (let i = 0; i < 80; i++) {
      this.dust.push({ x: rand(0, W), y: rand(0, H), f: rand(0.5, 1.4), a: rand(0.12, 0.4) });
    }

    this.lander = { x: W / 2, y: 70, vx: 0, vy: 0, a: 0, fuel: 1000, thrusting: false, alive: false };
    this.levelData = generateLevel(1);
    this.drawTerrain();
    this.baseWind = 0; this.wind = 0; this.gustEnd = -1; this.gustVal = 0;
    this.resetWind();

    this.createHUD();
    this.createOverlays();
    this.showOverlay('menu');
    this.hudC.setVisible(false);

    // input (raw keyboard events, exact codes)
    const onDown = (e) => {
      const c = e.code || e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
      this.sfx.init(); this.sfx.resume();
      this.held[c] = true;
      if (e.repeat) return;
      if (c === 'Enter' || c === 'NumpadEnter') this.onEnter();
      else if (c === 'KeyP' || e.key === 'p' || e.key === 'P') this.onPause();
    };
    const onUp = (e) => { this.held[e.code || e.key] = false; };
    const onBlur = () => { this.held = {}; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    });

    this.game.events.once('postrender', () => { this.ready = true; this.publish(); });
    this.publish();

    // test/debug hooks: drive real landing / crash code paths
    window.__FORGE__.debug = {
      land: (mult = 1) => {
        if (this.state !== 'playing' || this.phase !== 'flying') return false;
        const pads = this.levelData.pads;
        const pad = pads.find((p) => p.mult === mult) || pads[0];
        const L = this.lander;
        L.x = pad.cx; L.y = pad.y - FOOT_Y; L.vx = 0; L.vy = 10; L.a = 0;
        this.land(pad);
        return true;
      },
      crash: () => {
        if (this.state !== 'playing' || this.phase !== 'flying') return false;
        this.crash('DEBUG');
        return true;
      },
      setFuel: (n) => { this.lander.fuel = clamp(+n || 0, 0, this.levelData.fuel); return this.lander.fuel; },
    };
  }

  // ------------------------------------------------------------ setup helpers
  makeStars() {
    // stars are baked into the terrain texture (single full-screen layer)
    this.starList = [];
    for (let i = 0; i < 220; i++) {
      const r = Math.random();
      this.starList.push({
        col: r < 0.1 ? C.blue : r < 0.18 ? C.yellow : C.white,
        a: rand(0.15, 0.8), x: rand(0, W), y: rand(0, H * 0.95),
        r: Math.random() < 0.85 ? 0.8 : 1.4,
      });
    }
    this.twinkles = [];
    for (let i = 0; i < 26; i++) {
      this.twinkles.push({ x: rand(0, W), y: rand(0, H * 0.7), r: rand(1, 1.8), sp: rand(1, 3), ph: rand(0, 6) });
    }
  }

  txt(x, y, s, size, color, extra = {}) {
    return this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, ...extra });
  }

  setT(obj, str, color) {
    if (obj._s !== str) { obj.setText(str); obj._s = str; }
    if (color && obj._c !== color) { obj.setColor(color); obj._c = color; }
  }

  createHUD() {
    const pg = this.make.graphics({ x: 0, y: 0 }, false);
    pg.fillStyle(0x0b0e15, 0.72); pg.lineStyle(1, C.grey, 0.7);
    pg.fillRoundedRect(14, 12, 300, 146, 8); pg.strokeRoundedRect(14, 12, 300, 146, 8);
    pg.fillRoundedRect(W / 2 - 150, 12, 300, 128, 8); pg.strokeRoundedRect(W / 2 - 150, 12, 300, 128, 8);
    pg.fillRoundedRect(W - 254, 12, 240, 120, 8); pg.strokeRoundedRect(W - 254, 12, 240, 120, 8);
    pg.generateTexture('hudpanels', W, 170);
    pg.destroy();
    this.hudPanels = this.add.image(0, 0, 'hudpanels').setOrigin(0).setDepth(9.5).setVisible(false);
    this.hudC = this.add.container(0, 0).setDepth(11);
    const w = HEX(C.white);
    this.fuelLbl = this.txt(26, 23, 'FUEL', 18, w);
    this.fuelNum = this.txt(190, 32, '', 14, w).setOrigin(0.5).setStroke('#05060a', 4);
    this.vText = this.txt(26, 52, '', 18, w);
    this.hText = this.txt(26, 78, '', 18, w);
    this.tText = this.txt(26, 104, '', 18, w);
    this.aText = this.txt(26, 130, '', 18, w);
    this.windLbl = this.txt(W / 2, 16, 'WIND', 16, HEX(C.grey)).setOrigin(0.5, 0);
    this.windVal = this.txt(W / 2, 64, '', 16, w).setOrigin(0.5, 0);
    this.nextText = this.txt(W / 2, 116, '', 14, HEX(C.yellow)).setOrigin(0.5, 0);
    this.scoreText = this.txt(W - 30, 22, '', 24, w).setOrigin(1, 0);
    this.levelText = this.txt(W - 30, 58, '', 18, w).setOrigin(1, 0);
    this.livesLbl = this.txt(W - 236, 94, 'LIVES', 18, w);
    this.warnText = this.txt(W / 2, 176, '', 22, HEX(C.red)).setOrigin(0.5, 0).setStroke('#05060a', 4);
    this.hudC.add([this.fuelLbl, this.fuelNum, this.vText, this.hText, this.tText, this.aText,
      this.windLbl, this.windVal, this.nextText, this.scoreText, this.levelText, this.livesLbl, this.warnText]);

    this.bannerTitle = this.txt(W / 2, 290, '', 54, w).setOrigin(0.5).setDepth(15).setAlpha(0)
      .setShadow(0, 0, HEX(C.blue), 14, true, true);
    this.bannerSub = this.txt(W / 2, 345, '', 22, HEX(C.yellow)).setOrigin(0.5).setDepth(15).setAlpha(0);
  }

  createOverlays() {
    this.overlayBg = this.add.rectangle(W / 2, H / 2, W, H, C.bg, 0.6).setDepth(19);

    this.menuC = this.add.container(0, 0).setDepth(20);
    const panel = this.add.rectangle(W / 2, 382, 980, 470, C.bg, 0.9).setStrokeStyle(1.5, C.grey, 0.8);
    this.menuC.add(panel);
    const title = this.txt(W / 2, 200, 'Gusty Descent', 88, HEX(C.white)).setOrigin(0.5)
      .setShadow(0, 0, HEX(C.blue), 20, true, true);
    const sub = this.txt(W / 2, 272, 'Touch down softly. Mind the wind.', 26, HEX(C.orange)).setOrigin(0.5);
    const prompt = this.txt(W / 2, 372, 'Press Enter to start', 38, HEX(C.yellow)).setOrigin(0.5)
      .setShadow(0, 0, HEX(C.orange), 12, true, true);
    this.tweens.add({ targets: prompt, alpha: 0.7, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const ctrl = this.txt(W / 2, 460, '↑ Thrust      ← → Rotate      P Pause', 24, HEX(C.white)).setOrigin(0.5);
    const rules = this.txt(W / 2, 540,
      'Safe landing: V.SPD < 40   H.SPD < 25   TILT < 12°\n' +
      'Pads: x1 wide  ·  x2 medium  ·  x3 narrow & risky\n' +
      'Land on 5 levels to win — you have 3 landers',
      19, HEX(0xaab2c0), { align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.menuC.add([title, sub, prompt, ctrl, rules]);

    this.endC = this.add.container(0, 0).setDepth(20);
    this.endTitle = this.txt(W / 2, 250, '', 72, HEX(C.white)).setOrigin(0.5);
    this.endScore = this.txt(W / 2, 340, '', 32, HEX(C.yellow)).setOrigin(0.5);
    this.endPrompt = this.txt(W / 2, 430, 'Press Enter to play again', 30, HEX(C.white)).setOrigin(0.5);
    this.tweens.add({ targets: this.endPrompt, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
    this.endC.add([this.endTitle, this.endScore, this.endPrompt]);

    this.pauseC = this.add.container(0, 0).setDepth(20);
    const pt = this.txt(W / 2, 320, 'PAUSED', 72, HEX(C.white)).setOrigin(0.5)
      .setShadow(0, 0, HEX(C.blue), 16, true, true);
    const ps = this.txt(W / 2, 395, 'Press P to resume', 26, HEX(C.yellow)).setOrigin(0.5);
    this.pauseC.add([pt, ps]);
  }

  showOverlay(name) {
    this.overlayBg.setVisible(!!name);
    this.overlayBg.setAlpha(1);
    this.overlayBg.setFillStyle(C.bg, name === 'pause' ? 0.45 : name === 'menu' ? 0.7 : 0.6);
    this.menuC.setVisible(name === 'menu');
    this.endC.setVisible(name === 'end');
    this.pauseC.setVisible(name === 'pause');
  }

  drawTerrain() {
    const g = this.terrainGfx, d = this.levelData, pts = d.pts;
    g.clear();
    g.fillStyle(C.bg, 1);
    g.fillRect(0, 0, W, H);
    for (const s of this.starList) {
      g.fillStyle(s.col, s.a);
      g.fillCircle(s.x, s.y, s.r);
    }
    g.fillStyle(C.slate, 1);
    g.beginPath();
    g.moveTo(0, H);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();
    // speckle texture
    for (let i = 0; i < 160; i++) {
      const x = rand(0, W), gy = groundY(pts, x);
      const y = rand(gy + 8, H);
      if (y > H) continue;
      g.fillStyle(i % 3 ? C.grey : 0x3a4150, rand(0.15, 0.4));
      g.fillCircle(x, y, rand(0.8, 2.2));
    }
    // inner highlight + outline
    g.lineStyle(6, C.grey, 0.12);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y + 3);
    for (const p of pts) g.lineTo(p.x, p.y + 3);
    g.strokePath();
    g.lineStyle(2, C.grey, 1);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.strokePath();

    // pads
    for (const p of d.pads) {
      g.lineStyle(14, p.color, 0.12); g.lineBetween(p.x0, p.y, p.x1, p.y);
      g.lineStyle(8, p.color, 0.25); g.lineBetween(p.x0, p.y, p.x1, p.y);
      g.lineStyle(3, p.color, 1); g.lineBetween(p.x0, p.y, p.x1, p.y);
      g.lineStyle(2, C.grey, 1);
      g.lineBetween(p.x0 + 3, p.y, p.x0 + 3, p.y - 10);
      g.lineBetween(p.x1 - 3, p.y, p.x1 - 3, p.y - 10);
    }

    this.terrainKey ^= 1;
    const key = 'terrain' + this.terrainKey;
    if (this.textures.exists(key)) this.textures.remove(key);
    g.generateTexture(key, W, H);
    this.terrainImg.setTexture(key);

    this.padLabels.forEach((l) => l.destroy());
    this.padLabels = d.pads.map((p) =>
      this.txt(p.cx, p.y - 42, 'x' + p.mult, 22, HEX(p.color)).setOrigin(0.5).setDepth(3)
        .setShadow(0, 0, HEX(p.color), 10, true, true));
  }

  // ------------------------------------------------------------ flow
  onEnter() {
    this.sfx.init();
    if (this.state === 'menu' || this.state === 'won' || this.state === 'lost') this.startGame();
  }

  onPause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.showOverlay('pause');
      this.sfx.tone(440, 0.08, 'square', 0.08);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.showOverlay(null);
      this.sfx.tone(660, 0.08, 'square', 0.08);
    }
  }

  startGame() {
    this.endToken++;
    this.score = 0; this.lives = START_LIVES; this.level = 1;
    this.levelData = generateLevel(1);
    this.drawTerrain();
    this.particles.length = 0;
    this.state = 'playing';
    this.showOverlay(null);
    this.hudC.setVisible(true);
    this.isRetry = false;
    this.startLevel();
    this.sfx.blip();
  }

  startLevel() {
    const d = this.levelData, L = this.lander;
    this.tweens.killTweensOf(L);
    Object.assign(L, { x: d.start.x, y: d.start.y, vx: d.start.vx, vy: 0, a: 0, fuel: d.fuel, thrusting: false, alive: true });
    this.phase = 'flying';
    this.phaseTimer = 0;
    this.beepTimer = 0;
    this.emitAcc = 0;
    this.resetWind();
    this.showBanner();
  }

  nextLevel() {
    this.level++;
    this.levelData = generateLevel(this.level);
    this.drawTerrain();
    this.isRetry = false;
    this.startLevel();
  }

  restartLevel() {
    this.isRetry = true;
    this.startLevel();
  }

  showBanner() {
    const d = this.levelData;
    this.bannerTitle.setText(this.isRetry ? `LEVEL ${this.level} — RETRY` : `LEVEL ${this.level}`);
    this.bannerSub.setText(this.isRetry
      ? `${this.lives} lander${this.lives === 1 ? '' : 's'} left`
      : `Max wind ±${d.maxWind}   ·   Fuel ${d.fuel}`);
    const targets = [this.bannerTitle, this.bannerSub];
    this.tweens.killTweensOf(targets);
    targets.forEach((t) => t.setAlpha(0));
    this.tweens.add({ targets, alpha: 1, duration: 250, yoyo: true, hold: 1300 });
  }

  showEndDelayed(won) {
    const tok = ++this.endToken;
    this.time.delayedCall(won ? 1400 : 1200, () => {
      if (tok !== this.endToken) return;
      if (won) {
        this.endTitle.setText('Mission Complete!').setColor(HEX(C.green)).setShadow(0, 0, HEX(C.green), 18, true, true);
        this.endScore.setText(`All 5 landings made  ·  Score ${this.score}`);
      } else {
        this.endTitle.setText('Mission Failed').setColor(HEX(C.red)).setShadow(0, 0, HEX(C.red), 18, true, true);
        this.endScore.setText(`Out of landers on level ${this.level}  ·  Score ${this.score}`);
      }
      this.showOverlay('end');
      this.endC.setAlpha(0); this.overlayBg.setAlpha(0);
      this.tweens.add({ targets: [this.endC, this.overlayBg], alpha: 1, duration: 500 });
    });
  }

  // ------------------------------------------------------------ wind
  resetWind() {
    const max = this.levelData.maxWind;
    this.baseWind = rand(-max, max) * 0.7;
    this.wind = this.baseWind;
    this.gustEnd = -1;
    this.scheduleWind(true);
  }

  scheduleWind(first) {
    const max = this.levelData.maxWind;
    const gust = !first && Math.random() < 0.35;
    let value;
    if (gust) {
      value = (Math.random() < 0.5 ? -1 : 1) * 2 * max * rand(0.8, 1);
    } else {
      value = rand(-max, max);
      if (Math.abs(value - this.baseWind) < max * 0.35) {
        value = this.baseWind > 0 ? rand(-max, this.baseWind - max * 0.4) : rand(this.baseWind + max * 0.4, max);
      }
    }
    this.nextWind = { time: this.t + (first ? rand(2.5, 4.5) : rand(3, 6)), gust, value, warned: false };
  }

  updateWind(dt) {
    const ev = this.nextWind;
    const playing = this.state === 'playing';
    if (!ev.warned && ev.time - this.t <= 1) {
      ev.warned = true;
      if (playing && ev.gust) this.sfx.warn();
    }
    if (this.t >= ev.time) {
      if (ev.gust) {
        this.gustEnd = this.t + 1;
        this.gustVal = ev.value;
        if (playing) this.sfx.gust(1);
      } else {
        this.baseWind = ev.value;
        if (playing) this.sfx.gust(0.3);
      }
      this.scheduleWind(false);
    }
    const target = this.t < this.gustEnd ? this.gustVal : this.baseWind;
    this.wind += (target - this.wind) * Math.min(1, dt * 5);
  }

  // ------------------------------------------------------------ update
  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.state !== 'paused') {
      this.t += dt;
      this.updateWind(dt);
      if (this.state === 'playing') this.updatePlaying(dt);
      this.updateParticles(dt);
      this.updateDust(dt);
    }
    const thr = this.state === 'playing' && this.phase === 'flying' && this.lander.thrusting;
    this.sfx.setThrust(thr);
    this.sfx.setWind(this.state === 'paused' ? 0 : 0.03 + 0.14 * Math.min(1, Math.abs(this.wind) / 40));
    this.renderFrame();
    this.publish();
  }

  updatePlaying(dt) {
    if (this.phase === 'flying') {
      const sub = 2;
      for (let i = 0; i < sub; i++) {
        this.stepLander(dt / sub);
        if (this.phase !== 'flying') break;
      }
      const L = this.lander;
      if (this.phase === 'flying' && L.thrusting) {
        this.emitAcc += dt * 110;
        while (this.emitAcc >= 1) { this.emitAcc -= 1; this.emitExhaust(); }
      }
      const frac = L.fuel / this.levelData.fuel;
      if (this.phase === 'flying' && L.fuel > 0 && frac < 0.2) {
        this.beepTimer -= dt;
        if (this.beepTimer <= 0) { this.sfx.beep(); this.beepTimer = 0.55; }
      }
    } else {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.phase === 'landed') this.nextLevel();
        else if (this.phase === 'crashed') this.restartLevel();
      }
    }
  }

  stepLander(dt) {
    const L = this.lander;
    const left = !!this.held.ArrowLeft, right = !!this.held.ArrowRight, up = !!this.held.ArrowUp;
    if (left) L.a -= ROT_SPEED * dt;
    if (right) L.a += ROT_SPEED * dt;
    L.a = clamp(L.a, -MAX_TILT, MAX_TILT);
    L.thrusting = up && L.fuel > 0;
    let ax = this.wind, ay = GRAVITY;
    if (L.thrusting) {
      ax += Math.sin(L.a) * THRUST;
      ay -= Math.cos(L.a) * THRUST;
      L.fuel = Math.max(0, L.fuel - BURN * dt);
    }
    L.vx += ax * dt; L.vy += ay * dt;
    L.x += L.vx * dt; L.y += L.vy * dt;
    if (L.x < 20) { L.x = 20; L.vx = Math.abs(L.vx) * 0.3; }
    if (L.x > W - 20) { L.x = W - 20; L.vx = -Math.abs(L.vx) * 0.3; }
    if (L.y < 12) { L.y = 12; if (L.vy < 0) L.vy = 0; }
    this.checkContact();
  }

  checkContact() {
    const L = this.lander, pts = this.levelData.pts;
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const w = HULL.map((p) => ({ x: L.x + p.x * c - p.y * s, y: L.y + p.x * s + p.y * c }));
    let hullHit = false;
    for (const i of [0, 1, 4]) if (w[i].y >= groundY(pts, w[i].x)) hullHit = true;
    if (!hullHit) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of w) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      for (const v of pts) {
        if (v.x < minX || v.x > maxX || v.y < minY || v.y > maxY) continue;
        const dx = v.x - L.x, dy = v.y - L.y;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (insideHull(lx, ly)) { hullHit = true; break; }
      }
    }
    const fR = w[2], fL = w[3];
    const rT = fR.y >= groundY(pts, fR.x), lT = fL.y >= groundY(pts, fL.x);
    if (!hullHit && !rT && !lT) return;
    if (hullHit) { this.crash('HULL IMPACT'); return; }
    const fx0 = Math.min(fR.x, fL.x), fx1 = Math.max(fR.x, fL.x);
    const pad = this.levelData.pads.find((p) => fx0 >= p.x0 && fx1 <= p.x1);
    const tilt = Math.abs(L.a) / DEG;
    if (!pad) { this.crash('MISSED THE PAD'); return; }
    if (L.vy >= SAFE_VY) { this.crash('TOO FAST'); return; }
    if (Math.abs(L.vx) >= SAFE_VX) { this.crash('TOO MUCH DRIFT'); return; }
    if (tilt >= SAFE_TILT) { this.crash('TOO TILTED'); return; }
    this.land(pad);
  }

  land(pad) {
    const L = this.lander;
    this.phase = 'landed';
    L.thrusting = false;
    const bonus = Math.floor(L.fuel / 4);
    const pts = pad.mult * (100 + bonus);
    this.score += pts;
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const maxFootY = Math.max(L.y + FOOT_X * s + FOOT_Y * c, L.y - FOOT_X * s + FOOT_Y * c);
    L.y -= (maxFootY - pad.y);
    L.vx = 0; L.vy = 0;
    this.tweens.add({ targets: L, a: 0, y: pad.y - FOOT_Y, duration: 260, ease: 'Sine.easeOut' });

    for (let i = 0; i < 36; i++) {
      const ang = -Math.PI / 2 + rand(-1.1, 1.1);
      const sp = rand(60, 200);
      this.particles.push({
        kind: 'spark', color: i % 3 ? pad.color : C.white, x: L.x + rand(-FOOT_X, FOOT_X), y: pad.y - 2,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 120, life: rand(0.5, 1.1), max: 1.1, size: rand(1.2, 2.6), windF: 0.3,
      });
    }
    this.cameras.main.shake(140, 0.003);
    this.sfx.chime();
    this.popup(L.x, pad.y - 90, 'SAFE LANDING!', HEX(C.green), 30, 0);
    this.popup(L.x, pad.y - 60, `+${pts}  (x${pad.mult} × ${100 + bonus})`, HEX(pad.color), 22, 150);

    if (this.level >= MAX_LEVEL) {
      this.state = 'won';
      this.showEndDelayed(true);
    } else {
      this.phaseTimer = 2.2;
    }
  }

  crash(reason) {
    const L = this.lander;
    this.phase = 'crashed';
    L.alive = false; L.thrusting = false;
    this.explode(L.x, L.y, L.vx, L.vy);
    this.cameras.main.shake(450, 0.014);
    this.cameras.main.flash(180, 255, 110, 40);
    this.sfx.crash();
    this.lives = Math.max(0, this.lives - 1);
    this.popup(L.x, L.y - 50, 'CRASH! ' + reason, HEX(C.red), 28, 0);
    if (this.lives <= 0) {
      this.state = 'lost';
      this.showEndDelayed(false);
    } else {
      this.phaseTimer = 2.0;
    }
  }

  popup(x, y, str, color, size, delay) {
    const t = this.txt(clamp(x, 180, W - 180), y, str, size, color).setOrigin(0.5).setDepth(16)
      .setStroke('#05060a', 5).setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 180, delay, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t, y: y - 50, alpha: 0, duration: 900, delay: delay + 1000, ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  // ------------------------------------------------------------ particles
  emitExhaust() {
    if (this.particles.length > 700) return;
    const L = this.lander;
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const nx = L.x - 10 * LS * s, ny = L.y + 10 * LS * c;
    const sp = rand(110, 190), spread = rand(-35, 35);
    const life = rand(0.3, 0.55);
    this.particles.push({
      kind: 'fire', x: nx + rand(-2, 2), y: ny, vx: -s * sp + c * spread + L.vx, vy: c * sp + s * spread + L.vy,
      g: 0, life, max: life, size: rand(1.5, 3.2), windF: 1,
    });
  }

  explode(x, y, vx, vy) {
    for (let i = 0; i < 80; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(40, 320), life = rand(0.6, 1.6);
      this.particles.push({
        kind: 'fire', x, y, vx: Math.cos(ang) * sp + vx * 0.3, vy: Math.sin(ang) * sp + vy * 0.3 - 40,
        g: 80, life, max: life, size: rand(1.5, 4.5), windF: 0.6,
      });
    }
    for (let i = 0; i < 24; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(200, 420), life = rand(0.4, 0.9);
      this.particles.push({
        kind: 'spark', color: C.white, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        g: 200, life, max: life, size: rand(1, 2), windF: 0.2,
      });
    }
    this.particles.push({ kind: 'ring', x, y, life: 0.5, max: 0.5 });
    this.particles.push({ kind: 'ring', x, y, life: 0.8, max: 0.8 });
  }

  updateParticles(dt) {
    const ps = this.particles, pts = this.levelData.pts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      if (p.kind === 'ring') continue;
      p.vy += p.g * dt;
      p.vx += this.wind * p.windF * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const gy = groundY(pts, p.x);
      if (p.y > gy) { p.y = gy; p.vy = -Math.abs(p.vy) * 0.3; p.vx = p.vx * 0.7 + rand(-40, 40); }
    }
  }

  dustVx() { return this.wind * 9 + Math.sign(this.wind) * 6; }

  updateDust(dt) {
    const vx = this.dustVx();
    for (const d of this.dust) {
      d.x += vx * d.f * dt;
      d.y += 5 * d.f * dt;
      if (d.x > W + 30) { d.x = -30; d.y = rand(0, H); }
      else if (d.x < -30) { d.x = W + 30; d.y = rand(0, H); }
      if (d.y > H) d.y = 0;
    }
  }

  // ------------------------------------------------------------ rendering
  renderFrame() {
    const g = this.dyn, dg = this.dustGfx;
    g.clear(); dg.clear();

    for (const s of this.twinkles) {
      dg.fillStyle(C.white, 0.2 + 0.8 * Math.abs(Math.sin(this.t * s.sp + s.ph)));
      dg.fillRect(s.x - s.r * 0.7, s.y - s.r * 0.7, s.r * 1.4, s.r * 1.4);
    }
    const vx = this.dustVx();
    for (const d of this.dust) {
      const v = vx * d.f;
      const len = clamp(Math.abs(v) * 0.05, 1, 44) * (v < 0 ? -1 : 1);
      dg.lineStyle(1.2, C.white, d.a);
      dg.lineBetween(d.x, d.y, d.x - len, d.y);
    }

    // beacons + labels
    const pads = this.levelData.pads;
    pads.forEach((p, i) => {
      const a = 0.5 + 0.5 * Math.sin(this.t * 5 + i * 1.7);
      for (const x of [p.x0 + 3, p.x1 - 3]) {
        g.fillStyle(p.color, 0.25 * a); g.fillCircle(x, p.y - 11, 8);
        g.fillStyle(p.color, 0.4 + 0.6 * a); g.fillCircle(x, p.y - 11, 3);
      }
      const lbl = this.padLabels[i];
      if (lbl) {
        lbl.y = p.y - 42 + Math.sin(this.t * 2 + i) * 3;
        lbl.setVisible(this.state !== 'menu');
      }
    });

    // particles
    for (const p of this.particles) {
      const r = p.life / p.max;
      if (p.kind === 'ring') {
        g.lineStyle(3 * r + 1, C.orange, r);
        g.strokeCircle(p.x, p.y, (1 - r) * 90 + 6);
      } else if (p.kind === 'fire') {
        const col = r > 0.7 ? C.yellow : r > 0.4 ? C.orange : C.red;
        const sz = p.size * (0.4 + 0.6 * r);
        g.fillStyle(col, Math.min(1, r * 1.3));
        g.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      } else {
        g.fillStyle(p.color, r);
        g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
    }

    if (this.lander.alive && this.state !== 'menu') this.drawLander(g, this.lander);
    this.drawHUD();
  }

  drawLander(g, L) {
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const tw = (lx, ly) => {
      lx *= LS; ly *= LS;
      return { x: L.x + lx * c - ly * s, y: L.y + lx * s + ly * c };
    };
    if (L.thrusting && this.phase === 'flying' && this.state === 'playing' || (L.thrusting && this.state === 'paused')) {
      const len = 16 + Math.random() * 12;
      const p1 = tw(-6, 8), p2 = tw(6, 8), p3 = tw(0, 8 + len);
      g.fillStyle(C.orange, 0.9); g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      const q1 = tw(-3, 8), q2 = tw(3, 8), q3 = tw(0, 8 + len * 0.55);
      g.fillStyle(C.yellow, 1); g.fillTriangle(q1.x, q1.y, q2.x, q2.y, q3.x, q3.y);
      const glow = tw(0, 12);
      g.fillStyle(C.orange, 0.12); g.fillCircle(glow.x, glow.y, 24);
    }
    const a = tw(0, -18), b = tw(13, 4), d = tw(-13, 4);
    g.fillStyle(0x10131a, 1); g.fillTriangle(a.x, a.y, b.x, b.y, d.x, d.y);
    g.lineStyle(2.8, C.white, 1); g.strokeTriangle(a.x, a.y, b.x, b.y, d.x, d.y);
    const k = [tw(-9, 4), tw(-6, 8), tw(6, 8), tw(9, 4)];
    g.beginPath(); g.moveTo(k[0].x, k[0].y);
    for (let i = 1; i < k.length; i++) g.lineTo(k[i].x, k[i].y);
    g.strokePath();
    const l1 = tw(-8, 4), l2 = tw(-17, 15), r1 = tw(8, 4), r2 = tw(17, 15);
    g.lineBetween(l1.x, l1.y, l2.x, l2.y);
    g.lineBetween(r1.x, r1.y, r2.x, r2.y);
    const f1 = tw(-21, 15), f2 = tw(-13, 15), f3 = tw(13, 15), f4 = tw(21, 15);
    g.lineBetween(f1.x, f1.y, f2.x, f2.y);
    g.lineBetween(f3.x, f3.y, f4.x, f4.y);
    const wdw = tw(0, -4);
    g.lineStyle(2, C.blue, 1); g.strokeCircle(wdw.x, wdw.y, 3.5 * LS);
  }

  drawArrow(g, cx, cy, v, color, alpha, th) {
    if (Math.abs(v) < 0.4) {
      g.lineStyle(2, color, alpha); g.strokeCircle(cx, cy, 5);
      return;
    }
    const dir = v >= 0 ? 1 : -1;
    const len = 14 + Math.min(1, Math.abs(v) / 48) * 100;
    const x0 = cx - dir * len / 2, x1 = cx + dir * len / 2;
    g.lineStyle(th, color, alpha); g.lineBetween(x0, cy, x1 - dir * 8, cy);
    g.fillStyle(color, alpha); g.fillTriangle(x1, cy, x1 - dir * 13, cy - 8, x1 - dir * 13, cy + 8);
  }

  drawHUD() {
    const g = this.hudGfx;
    g.clear();
    this.hudPanels.setVisible(this.hudC.visible);
    if (!this.hudC.visible) return;
    const L = this.lander, d = this.levelData;
    // throttle frequently-changing text re-renders (~10 Hz)
    const doText = this._hudT === undefined || this.t - this._hudT >= 0.1 || this.t < this._hudT || this.state !== 'playing';
    if (doText) this._hudT = this.t;

    // fuel
    const frac = clamp(L.fuel / d.fuel, 0, 1);
    const bx = 90, by = 24, bw = 200, bh = 16;
    g.fillStyle(0x1a1f2a, 1); g.fillRect(bx, by, bw, bh);
    const col = frac > 0.5 ? C.green : frac > 0.2 ? C.yellow : C.red;
    const flash = frac <= 0.2 && Math.floor(this.t * 6) % 2 === 0;
    g.fillStyle(col, flash ? 0.45 : 1); g.fillRect(bx, by, bw * frac, bh);
    g.lineStyle(1, C.white, 0.2); g.lineBetween(bx + bw * 0.2, by, bx + bw * 0.2, by + bh);
    g.lineStyle(1, C.white, 0.6); g.strokeRect(bx, by, bw, bh);
    const green = HEX(C.green), red = HEX(C.red);
    const gusting = this.t < this.gustEnd;
    if (doText) {
      this.setT(this.fuelNum, `${Math.ceil(L.fuel)}`);
      const vy = L.vy, hx = Math.abs(L.vx), tilt = Math.abs(L.a) / DEG;
      this.setT(this.vText, `V.SPD ${String(Math.round(Math.abs(vy))).padStart(4)} ${vy >= 0 ? '↓' : '↑'}`, vy < SAFE_VY ? green : red);
      this.setT(this.hText, `H.SPD ${String(Math.round(hx)).padStart(4)} ${L.vx >= 0 ? '→' : '←'}`, hx < SAFE_VX ? green : red);
      this.setT(this.tText, `TILT  ${String(Math.round(tilt)).padStart(4)}°`, tilt < SAFE_TILT ? green : red);
      const alt = Math.max(0, groundY(d.pts, L.x) - (L.y + FOOT_Y));
      this.setT(this.aText, `ALT   ${String(Math.round(alt)).padStart(4)}`, HEX(C.white));
      this.setT(this.windVal, `${Math.abs(this.wind).toFixed(1)} ${this.wind >= 0 ? '→' : '←'}${gusting ? '  GUST' : ''}`,
        gusting ? red : HEX(C.white));
    }

    // wind
    this.drawArrow(g, W / 2, 48, this.wind, gusting ? C.red : C.blue, 1, 4);
    const ev = this.nextWind, until = ev.time - this.t;
    if (until <= 1 && until >= 0) {
      const on = Math.floor(this.t * 8) % 2 === 0;
      const ncol = ev.gust ? C.red : C.yellow;
      this.drawArrow(g, W / 2, 102, ev.value, ncol, on ? 1 : 0.25, 3);
      this.setT(this.nextText, ev.gust ? `GUST INCOMING  ${Math.abs(ev.value).toFixed(0)}` : `WIND SHIFT  ${Math.abs(ev.value).toFixed(0)}`,
        HEX(ncol));
      this.nextText.setAlpha(on ? 1 : 0.4);
    } else {
      this.setT(this.nextText, '');
    }

    // score / level / lives
    this.setT(this.scoreText, `SCORE ${String(this.score).padStart(6, '0')}`);
    this.setT(this.levelText, `LEVEL ${this.level}/${MAX_LEVEL}`);
    for (let i = 0; i < START_LIVES; i++) {
      const x = W - 140 + i * 36, y = 104;
      const alive = i < this.lives;
      g.lineStyle(2, alive ? C.white : C.grey, alive ? 1 : 0.35);
      g.strokeTriangle(x, y - 10, x + 8, y + 5, x - 8, y + 5);
      g.lineBetween(x - 5, y + 5, x - 10, y + 11);
      g.lineBetween(x + 5, y + 5, x + 10, y + 11);
    }

    // warnings
    let warn = '';
    if (this.state === 'playing' && this.phase === 'flying') {
      if (L.fuel <= 0) warn = 'OUT OF FUEL — FREE FALL';
      else if (frac < 0.2) warn = 'LOW FUEL';
    }
    this.setT(this.warnText, warn);
    this.warnText.setAlpha(Math.floor(this.t * 4) % 2 === 0 ? 1 : 0.35);
  }

  publish() {
    const f = window.__FORGE__;
    const L = this.lander;
    f.ready = this.ready;
    f.state = this.state;
    f.score = this.score;
    f.lives = this.lives;
    f.level = this.level;
    f.phase = this.phase;
    f.fuel = Math.round(L.fuel);
    f.wind = Math.round(this.wind * 100) / 100;
    f.lander = {
      x: Math.round(L.x), y: Math.round(L.y), vx: Math.round(L.vx * 10) / 10, vy: Math.round(L.vy * 10) / 10,
      angle: Math.round(L.a / DEG), thrusting: !!L.thrusting, alive: !!L.alive,
    };
  }
}

// ---------------------------------------------------------------- boot
(function boot() {
  const el = document.getElementById('game');
  document.documentElement.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.height = '100%';
  document.body.style.background = '#05060a';
  document.body.style.overflow = 'hidden';
  if (el) { el.style.width = '100vw'; el.style.height = '100vh'; }
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: RENDER_W,
    height: RENDER_H,
    render: { powerPreference: 'high-performance', antialias: true },
    backgroundColor: '#05060a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [GameScene],
  });
})();
