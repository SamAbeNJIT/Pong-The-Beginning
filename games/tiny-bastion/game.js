// Tiny Bastion: a keyboard-driven single-screen tower defense (Phaser 3.90, global Phaser)

// ============================================================================
// Constants & data
// ============================================================================
const T = 64, COLS = 16, ROWS = 10, TOP = 52, PANEL_H = 120;
const W = COLS * T, BOARD_H = ROWS * T, PANEL_Y = TOP + BOARD_H, H = PANEL_Y + PANEL_H;
const FONT = '"Trebuchet MS", "Segoe UI", Verdana, Arial, sans-serif';
const D = { board: 0, gate: 1, ground: 2, shadow: 3, tower: 4, enemy: 5, proj: 6, fx: 7, num: 8, hud: 10, banner: 12, vignette: 14, overlay: 20 };
const MAX_PARTS = 300, MAX_NUMS = 40;
const FIRST_COUNTDOWN = 20, WAVE_COUNTDOWN = 12, TOTAL_WAVES = 10;
const ADD = Phaser.BlendModes.ADD;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

const TOWERS = {
  blaster: { name: 'Blaster', key: '1', cost: 50, color: 0x4ee6ff, range: 2.5, dmg: 8, cd: 0.3, desc: 'Rapid single-target' },
  mortar: { name: 'Mortar', key: '2', cost: 80, color: 0xff9a3c, range: 3.5, dmg: 25, cd: 1.6, minRange: 1, desc: 'Splash, min range 1' },
  frost: { name: 'Frost', key: '3', cost: 70, color: 0xaee3ff, range: 2.2, dmg: 3, cd: 1.0, desc: 'Pulse slow + chip dmg' },
};
const TOWER_ORDER = ['blaster', 'mortar', 'frost'];

function towerStats(type, L) {
  const d = TOWERS[type], i = L - 1;
  return {
    dmg: d.dmg * [1, 1.6, 2.5][i],
    range: d.range * [1, 1.15, 1.3][i],
    cd: d.cd * [1, 0.8, 0.65][i],
    splash: type === 'mortar' ? [0.9, 1.0, 1.25][i] : 0,
    minRange: type === 'mortar' ? 1 : 0,
    slow: type === 'frost' ? [0.4, 0.55, 0.65][i] : 0,
    slowDur: 1.5,
  };
}
function upgradeCost(type, L) {
  const c = TOWERS[type].cost;
  return L === 1 ? Math.round(c * 0.75) : L === 2 ? Math.round(c * 1.25) : 0;
}

const ENEMIES = {
  runner: { speed: 2.2, hp: 30, bounty: 5, armor: 0, r: 12, color: 0xffd84a, tex: 'e_runner', interval: 0.45 },
  grunt: { speed: 1.2, hp: 60, bounty: 6, armor: 0, r: 14, color: 0xff5a5a, tex: 'e_grunt', interval: 0.8 },
  tank: { speed: 0.7, hp: 220, bounty: 16, armor: 6, r: 20, color: 0x8fa27a, tex: 'e_tank', interval: 0.9 },
  swarm: { speed: 1.6, hp: 12, bounty: 2, armor: 0, r: 7, color: 0xff7ac8, tex: 'e_swarm', interval: 0.35 },
  healer: { speed: 1.0, hp: 80, bounty: 12, armor: 0, r: 14, color: 0x7fbf6a, tex: 'e_healer', interval: 0.9 },
  boss: { speed: 0.45, hp: 4200, bounty: 200, armor: 5, r: 36, color: 0x9b5cff, tex: 'e_boss', interval: 1.0 },
};
// Enemy HP multiplier per wave: front-loaded so waves 3-6 demand real damage, late waves unchanged.
const HP_MULT = [1.00, 1.10, 1.28, 1.48, 1.66, 1.80, 1.90, 2.05, 2.20, 2.35];
// Rushing: sending a wave early pays a small bonus but makes that wave tougher and packed tighter.
const EARLY_GOLD_PER_SEC = 1, RUSH_HP = 0.30, RUSH_PACK = 0.40;
const rushHeat = (secs) => clamp(secs / WAVE_COUNTDOWN, 0, 1);
const HEAL_PCT = 0.15, BOSS_HEAL_PCT = 0.03;
const LEVEL_SCALE = [1, 1.12, 1.25]; // extra sprite scale per tower level

// ----- Waves per map -----
const WAVES_1 = [
  { label: 'BASIC', groups: [['grunt', 8]] },
  { label: 'MIXED', groups: [['grunt', 6], ['runner', 4], ['grunt', 4]] },
  { label: 'FAST', groups: [['runner', 16]] },
  { label: 'SWARM', groups: [['grunt', 4], ['swarm', 24], ['grunt', 4]] },
  { label: 'ARMORED', groups: [['grunt', 4], ['tank', 4], ['grunt', 4]] },
  { label: 'HEALERS', groups: [['runner', 4], ['grunt', 5], ['healer', 1], ['grunt', 5], ['healer', 1], ['runner', 4], ['tank', 1]] },
  { label: 'SWARM x2', groups: [['swarm', 16], ['healer', 2], ['swarm', 16]] },
  { label: 'ARMORED', groups: [['runner', 4], ['tank', 2], ['healer', 1], ['tank', 3], ['healer', 1], ['runner', 4]] },
  { label: 'MIXED', groups: [['runner', 5], ['tank', 2], ['healer', 1], ['swarm', 20], ['tank', 2], ['healer', 2], ['runner', 5]] },
  { label: 'BOSS', groups: [['healer', 1], ['swarm', 6], ['tank', 1], ['healer', 1], ['boss', 1], ['tank', 1], ['swarm', 6]] },
];
const WAVES_2 = [
  { label: 'MIXED', groups: [['grunt', 6], ['runner', 4], ['grunt', 4]] },
  { label: 'FAST', groups: [['runner', 10], ['grunt', 6], ['runner', 6]] },
  { label: 'SWARM', groups: [['grunt', 3], ['swarm', 22], ['grunt', 3]] },
  { label: 'ARMORED', groups: [['grunt', 4], ['tank', 3], ['grunt', 4]] },
  { label: 'HEALERS', groups: [['runner', 4], ['grunt', 6], ['healer', 2], ['runner', 4], ['tank', 1]] },
  { label: 'SWARM x2', groups: [['swarm', 18], ['healer', 2], ['swarm', 18]] },
  { label: 'ARMORED', groups: [['tank', 3], ['healer', 1], ['tank', 3], ['runner', 8]] },
  { label: 'MIXED', groups: [['runner', 6], ['tank', 3], ['healer', 2], ['swarm', 20], ['tank', 2]] },
  { label: 'MIXED', groups: [['runner', 6], ['tank', 3], ['healer', 2], ['swarm', 24], ['tank', 2], ['healer', 1], ['runner', 6]] },
  { label: 'BOSS', groups: [['healer', 1], ['swarm', 8], ['tank', 2], ['healer', 1], ['boss', 1], ['tank', 1], ['swarm', 8]] },
];
const WAVES_3 = [
  { label: 'MIXED', groups: [['grunt', 6], ['runner', 6], ['grunt', 4]] },
  { label: 'FAST', groups: [['runner', 18]] },
  { label: 'SWARM', groups: [['grunt', 4], ['swarm', 28], ['grunt', 4]] },
  { label: 'ARMORED', groups: [['grunt', 6], ['tank', 4], ['grunt', 2]] },
  { label: 'HEALERS', groups: [['runner', 6], ['grunt', 6], ['healer', 2], ['tank', 2]] },
  { label: 'SWARM x2', groups: [['swarm', 20], ['healer', 2], ['swarm', 20]] },
  { label: 'ARMORED', groups: [['tank', 3], ['healer', 2], ['tank', 3], ['runner', 10]] },
  { label: 'MIXED', groups: [['runner', 8], ['tank', 3], ['healer', 2], ['swarm', 24], ['tank', 3]] },
  { label: 'MIXED', groups: [['tank', 4], ['healer', 3], ['swarm', 24], ['runner', 12], ['tank', 2]] },
  { label: 'BOSS', groups: [['healer', 2], ['swarm', 10], ['tank', 2], ['boss', 1], ['tank', 2], ['healer', 1], ['swarm', 10]] },
];
const WAVES_4 = [
  { label: 'MIXED', groups: [['grunt', 14], ['runner', 6]] },
  { label: 'FAST', groups: [['runner', 20], ['grunt', 6]] },
  { label: 'SWARM', groups: [['grunt', 4], ['swarm', 32], ['grunt', 4]] },
  { label: 'ARMORED', groups: [['grunt', 8], ['tank', 5]] },
  { label: 'HEALERS', groups: [['runner', 8], ['grunt', 8], ['healer', 2], ['tank', 3]] },
  { label: 'SWARM x2', groups: [['swarm', 24], ['healer', 4], ['swarm', 24]] },
  { label: 'ARMORED', groups: [['tank', 4], ['healer', 2], ['tank', 4], ['runner', 12]] },
  { label: 'MIXED', groups: [['runner', 12], ['tank', 4], ['healer', 2], ['swarm', 28], ['tank', 4]] },
  { label: 'MIXED', groups: [['tank', 6], ['healer', 4], ['swarm', 30], ['runner', 14], ['tank', 2]] },
  { label: 'BOSS', groups: [['healer', 2], ['swarm', 12], ['tank', 4], ['boss', 1], ['tank', 2], ['healer', 2], ['swarm', 12]] },
];
const LABEL_COLORS = { BASIC: '#e6eef8', MIXED: '#4ee6ff', FAST: '#ffd84a', SWARM: '#ff7ac8', 'SWARM x2': '#ff7ac8', ARMORED: '#b8c8a0', HEALERS: '#7fdc6a', BOSS: '#c9a0ff' };

// ----- Maps -----
// Each lane is a list of waypoint tiles: starts off-grid at col -1, ends off-grid at col 16.
const MAP_DEFS = [
  {
    name: 'Meadow Run', tag: 'Classic winding path', gold: 150, hpScale: 1, bossMult: 1, bossArmor: 5, boss: 'THE WARLORD', expectCross: 0,
    lanes: [[[-1, 2], [3, 2], [3, 7], [7, 7], [7, 2], [11, 2], [11, 7], [14, 7], [14, 4], [16, 4]]],
    waves: WAVES_1,
    plan: [[4, 3, 'blaster'], [2, 3, 'blaster'], [6, 3, 'mortar'], [5, 5, 'frost'], [4, 6, 'blaster'], [6, 6, 'blaster'],
      [8, 3, 'frost'], [10, 3, 'mortar'], [9, 5, 'blaster'], [8, 6, 'mortar'], [10, 6, 'frost'], [12, 3, 'blaster'],
      [12, 6, 'frost'], [13, 5, 'mortar'], [13, 3, 'frost']],
  },
  {
    name: 'Switchback', tag: 'Long tight zig-zag', gold: 150, hpScale: 1.15, bossMult: 1.2, bossArmor: 5, boss: 'IRON WARLORD', expectCross: 0,
    lanes: [[[-1, 1], [2, 1], [2, 8], [5, 8], [5, 1], [8, 1], [8, 8], [11, 8], [11, 1], [14, 1], [14, 8], [16, 8]]],
    waves: WAVES_2,
    plan: [[3, 4, 'blaster'], [4, 5, 'frost'], [6, 3, 'mortar'], [7, 6, 'blaster'], [9, 4, 'frost'], [10, 5, 'blaster'],
      [12, 3, 'mortar'], [13, 6, 'blaster'], [3, 2, 'mortar'], [6, 7, 'blaster']],
  },
  {
    name: 'Crossroads', tag: 'Path crosses a bridge', gold: 175, hpScale: 1.3, bossMult: 1.45, bossArmor: 6, boss: 'BRIDGE BREAKER', expectCross: 1,
    lanes: [[[-1, 5], [10, 5], [10, 1], [5, 1], [5, 8], [13, 8], [13, 3], [16, 3]]],
    waves: WAVES_3,
    plan: [[4, 4, 'blaster'], [6, 4, 'frost'], [6, 6, 'mortar'], [4, 6, 'blaster'], [8, 3, 'mortar'], [11, 6, 'blaster'],
      [12, 4, 'frost'], [3, 3, 'blaster'], [9, 7, 'blaster'], [14, 5, 'mortar']],
  },
  {
    name: 'Twin Gates', tag: 'Two lanes merge', gold: 225, hpScale: 1.45, bossMult: 1.75, bossArmor: 6, boss: 'THE TWIN KING', expectCross: 0,
    lanes: [
      [[-1, 1], [5, 1], [5, 4], [7, 4], [10, 4], [10, 7], [13, 7], [13, 2], [16, 2]],
      [[-1, 8], [4, 8], [4, 6], [7, 6], [7, 4], [10, 4], [10, 7], [13, 7], [13, 2], [16, 2]],
    ],
    waves: WAVES_4,
    plan: [[3, 3, 'blaster'], [2, 6, 'blaster'], [6, 5, 'frost'], [8, 5, 'mortar'], [9, 3, 'blaster'], [11, 5, 'frost'],
      [12, 4, 'mortar'], [14, 4, 'blaster'], [11, 8, 'blaster'], [6, 2, 'mortar']],
  },
];

function buildMap(def, idx) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(false));
  const crossings = [];
  const lanes = def.lanes.map((wps) => {
    const tiles = [], seen = new Set();
    for (let i = 0; i < wps.length - 1; i++) {
      const [c1, r1] = wps[i], [c2, r2] = wps[i + 1];
      const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1), n = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const c = c1 + dc * k, r = r1 + dr * k;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        const key = c + ',' + r;
        if (seen.has(key)) { if (!crossings.some(x => x[0] === c && x[1] === r)) crossings.push([c, r]); }
        else seen.add(key);
        tiles.push([c, r]); grid[r][c] = true;
      }
    }
    const pts = wps.map(([c, r]) => ({ x: c * T + T / 2, y: TOP + r * T + T / 2 }));
    const segs = [];
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      segs.push({ ax: a.x, ay: a.y, len: l, start: len, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, ang: Math.atan2(b.y - a.y, b.x - a.x) });
      len += l;
    }
    return { wps, tiles, pts, segs, len, spawn: pts[0] };
  });
  const m = { ...def, id: idx + 1, grid, lanes, crossings, exit: lanes[0].pts[lanes[0].pts.length - 1], bridge: null };
  if (crossings.length) {
    const [c, r] = crossings[0], x = c * T + T / 2, y = TOP + r * T + T / 2;
    const passes = [];
    for (const s of lanes[0].segs) {
      const ex = s.ax + s.dx * s.len, ey = s.ay + s.dy * s.len;
      if (Math.abs(s.dy) < 1e-6 && Math.abs(s.ay - y) < 0.5 && x >= Math.min(s.ax, ex) && x <= Math.max(s.ax, ex)) passes.push({ d: s.start + Math.abs(x - s.ax), horiz: true });
      else if (Math.abs(s.dx) < 1e-6 && Math.abs(s.ax - x) < 0.5 && y >= Math.min(s.ay, ey) && y <= Math.max(s.ay, ey)) passes.push({ d: s.start + Math.abs(y - s.ay), horiz: false });
    }
    passes.sort((a, b) => a.d - b.d);
    if (passes.length >= 2) m.bridge = { c, r, x, y, d: passes[1].d, horiz: passes[1].horiz };
  }
  return m;
}
const MAPS = MAP_DEFS.map(buildMap);

function pathAt(lane, d, out) {
  if (d < 0) d = 0; if (d > lane.len) d = lane.len;
  const S = lane.segs;
  let s = S[S.length - 1];
  for (let i = 0; i < S.length; i++) { if (d <= S[i].start + S[i].len) { s = S[i]; break; } }
  const k = d - s.start;
  out.x = s.ax + s.dx * k; out.y = s.ay + s.dy * k; out.ang = s.ang; out.px = -s.dy; out.py = s.dx;
  return out;
}

function buildQueue(map, waveNum, pace = 1) {
  const nL = map.lanes.length, q = [];
  for (let L = 0; L < nL; L++) {
    let t = 0.3 + L * 0.25;
    for (const [type, count] of map.waves[waveNum - 1].groups) {
      const n = Math.floor(count / nL) + (L < count % nL ? 1 : 0);
      for (let i = 0; i < n; i++) { q.push({ t, type, lane: L }); t += ENEMIES[type].interval * pace; }
      if (n) t += 0.8 * pace;
    }
  }
  q.sort((a, b) => a.t - b.t);
  return q;
}

function waveHp(map, w) {
  let s = 0;
  for (const [type, c] of map.waves[w - 1].groups) s += c * ENEMIES[type].hp * HP_MULT[w - 1] * (type === 'boss' ? map.bossMult : map.hpScale);
  return s;
}
function waveCount(map, w) { return map.waves[w - 1].groups.reduce((a, g) => a + g[1], 0); }

// Returns '' if valid, otherwise a description of the problem.
function validateMap(m) {
  const errs = [];
  if (!m.lanes.length) errs.push('no lanes');
  const ex = m.lanes[0].wps[m.lanes[0].wps.length - 1];
  m.lanes.forEach((lane, li) => {
    const w = lane.wps, f = w[0], l = w[w.length - 1];
    if (f[0] !== -1 || f[1] < 0 || f[1] >= ROWS) errs.push(`lane${li} spawn off left edge`);
    if (l[0] !== COLS || l[1] < 0 || l[1] >= ROWS) errs.push(`lane${li} exit not on right edge`);
    if (l[0] !== ex[0] || l[1] !== ex[1]) errs.push(`lane${li} different exit`);
    for (let i = 0; i < w.length - 1; i++) {
      const a = w[i], b = w[i + 1];
      if ((a[0] !== b[0]) === (a[1] !== b[1])) errs.push(`lane${li} seg${i} not straight`);
      if (i > 0 && (a[0] < 0 || a[0] >= COLS || a[1] < 0 || a[1] >= ROWS)) errs.push(`lane${li} wp${i} off grid`);
    }
    const t = lane.tiles;
    if (!t.length || t[0][0] !== 0 || t[t.length - 1][0] !== COLS - 1) errs.push(`lane${li} tiles do not span edge to edge`);
    for (let i = 1; i < t.length; i++) if (Math.abs(t[i][0] - t[i - 1][0]) + Math.abs(t[i][1] - t[i - 1][1]) !== 1) { errs.push(`lane${li} gap at tile ${i}`); break; }
    // flood fill over path tiles from spawn to exit
    if (t.length) {
      const goal = t[t.length - 1], vis = new Set([t[0].join(',')]), stack = [t[0]];
      let found = false;
      while (stack.length) {
        const [c, r] = stack.pop();
        if (c === goal[0] && r === goal[1]) { found = true; break; }
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || vis.has(k) || !m.grid[nr][nc]) continue;
          vis.add(k); stack.push([nc, nr]);
        }
      }
      if (!found) errs.push(`lane${li} spawn not connected to exit`);
    }
  });
  if (m.crossings.length !== m.expectCross) errs.push(`crossings ${m.crossings.length} != ${m.expectCross}`);
  if (m.expectCross && !m.bridge) errs.push('crossing has no bridge');
  return errs.join('; ');
}

// ----- Unlock persistence (storage may be blocked) -----
const STORE_KEY = 'tinyBastion.unlocked';
let memUnlocked = 1;
function loadUnlocked() {
  let v = memUnlocked;
  try { const n = parseInt(window.localStorage.getItem(STORE_KEY), 10); if (n > v) v = n; } catch (e) { /* blocked */ }
  return clamp(v, 1, MAPS.length);
}
function saveUnlocked(n) {
  n = clamp(n, 1, MAPS.length);
  if (n > memUnlocked) memUnlocked = n;
  try {
    const cur = parseInt(window.localStorage.getItem(STORE_KEY), 10) || 1;
    if (n > cur) window.localStorage.setItem(STORE_KEY, String(n));
  } catch (e) { /* blocked */ }
}

// ============================================================================
// Audio (WebAudio, lazily created on first key press)
// ============================================================================
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  const last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function ok(name, ms) {
    if (!ctx) return false;
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now; return true;
  }
  function env(g, t0, v, a, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
  }
  function tone(f, dur, o = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + dur);
    const g = ctx.createGain();
    env(g, t0, o.vol ?? 0.2, o.attack || 0.005, dur);
    let node = osc;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); node = fl; }
    node.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function noise(dur, o = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = o.ft || 'lowpass';
    fl.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
    const g = ctx.createGain();
    env(g, t0, o.vol ?? 0.2, o.attack || 0.004, dur);
    src.connect(fl); fl.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.4); src.stop(t0 + dur + 0.05);
  }
  return {
    init,
    setMuted(v) { muted = !!v; },
    shot() { if (!ok('shot', 45)) return; tone(1100, 0.07, { type: 'square', vol: 0.045, f2: 420 }); },
    mortar() { if (!ok('mortar', 80)) return; tone(140, 0.22, { vol: 0.35, f2: 45 }); noise(0.12, { vol: 0.12, f: 500 }); },
    explode() { if (!ok('boom', 70)) return; noise(0.4, { vol: 0.32, f: 1600, f2: 120 }); tone(90, 0.3, { vol: 0.28, f2: 35 }); },
    frost() { if (!ok('frost', 120)) return; tone(900, 0.4, { vol: 0.07, f2: 1700 }); tone(2200, 0.25, { type: 'triangle', vol: 0.03, delay: 0.05, f2: 2800 }); noise(0.3, { vol: 0.03, f: 6000, ft: 'highpass' }); },
    hit() { if (!ok('hit', 50)) return; tone(1500 + Math.random() * 300, 0.03, { type: 'triangle', vol: 0.025 }); },
    death() { if (!ok('death', 60)) return; noise(0.12, { vol: 0.16, f: 2000, ft: 'bandpass' }); tone(420, 0.12, { type: 'square', vol: 0.04, f2: 980, delay: 0.02 }); },
    coin() { if (!ok('coin', 90)) return; tone(988, 0.09, { type: 'triangle', vol: 0.12 }); tone(1319, 0.18, { type: 'triangle', vol: 0.12, delay: 0.07 }); },
    place() { tone(520, 0.16, { type: 'triangle', vol: 0.22, f2: 260 }); tone(1040, 0.06, { vol: 0.08 }); noise(0.05, { vol: 0.08, f: 3000 }); },
    upgrade() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.16, delay: i * 0.07 })); tone(1568, 0.3, { vol: 0.06, delay: 0.21 }); },
    sell() { [1046, 784, 523].forEach((f, i) => tone(f, 0.13, { type: 'triangle', vol: 0.14, delay: i * 0.07 })); },
    invalid() { if (!ok('inv', 90)) return; tone(110, 0.16, { type: 'sawtooth', vol: 0.12, lp: 900 }); tone(117, 0.16, { type: 'square', vol: 0.06, lp: 700 }); },
    waveStart() { tone(196, 0.7, { type: 'sawtooth', vol: 0.12, attack: 0.18, lp: 1200 }); tone(294, 0.7, { type: 'sawtooth', vol: 0.08, attack: 0.2, lp: 1200, delay: 0.05 }); },
    lifeLost() { if (!ok('life', 120)) return; tone(98, 0.4, { vol: 0.3 }); tone(104, 0.4, { vol: 0.25, type: 'triangle' }); },
    boss() {
      if (!ctx) return;
      tone(40, 2.2, { type: 'sawtooth', vol: 0.22, attack: 0.3, lp: 260 }); tone(60, 2, { type: 'sawtooth', vol: 0.12, attack: 0.4, lp: 200 });
      noise(1.6, { vol: 0.2, f: 220, attack: 0.3 }); tone(70, 0.5, { vol: 0.4, f2: 30 }); noise(0.3, { vol: 0.3, f: 900 });
    },
    victory() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.14 })); [523, 659, 784].forEach(f => tone(f, 1.0, { type: 'triangle', vol: 0.1, delay: 0.6 })); },
    defeat() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', vol: 0.1, lp: 1400, delay: i * 0.22 })); },
    tick() { if (!ok('tick', 30)) return; tone(1800, 0.02, { vol: 0.02 }); },
    heal() { if (!ok('heal', 250)) return; tone(660, 0.2, { vol: 0.04, f2: 990 }); },
  };
})();

// ============================================================================
// Global harness state
// ============================================================================
window.__FORGE__ = window.__FORGE__ || { ready: false, state: 'menu', score: 0, lives: 20, level: 1, wave: 1 };

// ============================================================================
// Scene
// ============================================================================
class Main extends Phaser.Scene {
  constructor() { super('main'); }

  // ---------------------------------------------------------------- setup
  create(data) {
    data = data || {};
    this.mapIdx = clamp(data.map || 1, 1, MAPS.length);
    this.map = MAPS[this.mapIdx - 1];
    this._selftest = !!data.selftest;
    this.genTextures();
    this.genBoard(this.map);
    this.initState();
    if (data.score) this.score = data.score;
    this.unlocked = loadUnlocked();
    this.menuSel = this.mapIdx <= this.unlocked ? this.mapIdx : 1;
    this.add.image(0, TOP, `board_${this.map.id}`).setOrigin(0, 0).setDepth(D.board);
    if (this.map.bridge) {
      const b = this.map.bridge;
      this.add.image(b.x, b.y, 'bridge').setDepth(D.enemy + 0.3).setRotation(b.horiz ? Math.PI / 2 : 0);
    }
    this.makeGates();
    this.hpG = this.add.graphics().setDepth(D.enemy + 0.5);
    this.cursorG = this.add.graphics().setDepth(D.tower + 0.5);
    this.ghostBase = this.add.image(0, 0, 'blaster_b1').setDepth(D.tower + 0.6).setAlpha(0.45).setVisible(false);
    this.ghostTurret = this.add.image(0, 0, 'blaster_t1').setDepth(D.tower + 0.7).setAlpha(0.45).setVisible(false);
    this.ghostKey = '';
    this.rangeG = this.add.graphics().setDepth(D.tower + 0.4);
    this.rangeKey = '';
    this.partPool = this.makePool(MAX_PARTS + 20, D.fx);
    this.digitPool = this.makePool(170, D.num);
    this.projPool = this.makePool(220, D.proj);
    this.makeFloatTexts();
    this.makeHUD();
    this.makePanel();
    this.makeBossBar();
    this.makeBanner();
    this.makeOverlays();
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(D.vignette).setAlpha(0);
    this.setupInput();

    this.kills = 0; this.leaks = 0;
    this._bossSpawned = false; this._bossBarShown = false; this._bossShake = false;
    const prevRep = window.__FORGE__.selfTestReport;
    if (prevRep && !data.selftest) {
      this.menuO.add(this.txt(W / 2, 775, `Self-test: ${prevRep.passed}/${prevRep.total} checks passed`, 18,
        prevRep.passed === prevRep.total ? '#7fdc6a' : '#ff7a7a').setOrigin(0.5));
    }
    if (data.selftest) {
      this.showMenu();
      this.runSelfTest();
      this.state = 'menu';
      this.menuO.setVisible(true); this.endO.setVisible(false); this.pauseO.setVisible(false); this.levelO.setVisible(false);
      this.time.delayedCall(30, () => this.scene.restart({}));
    } else if (data.autostart) this.startGame();
    else this.showMenu();
    window.__FORGE__.selfTest = () => { this.scene.restart({ selftest: true }); return 'running: poll window.__FORGE__.selfTestReport'; };
    if (!Main._autoTestDone && /[?&]selftest\b/.test(window.location.search)) {
      Main._autoTestDone = true;
      this.time.delayedCall(30, () => this.scene.restart({ selftest: true }));
    }

    const F = window.__FORGE__;
    if (!F.ready) this.game.events.once('postrender', () => { window.__FORGE__.ready = true; });
    this.publish();
  }

  initState() {
    this.state = 'menu';
    this.gold = this.map.gold; this.lives = 20; this.score = 0; this.wave = 0;
    this.levelDone = false;
    this.spawning = false; this.spawnQueue = []; this.spawnClock = 0;
    this.countdown = FIRST_COUNTDOWN; this.countdownActive = true;
    this.waveAlive = []; this.waveSpawnDone = []; this.waveCleared = []; this.rushHp = [];
    this.enemies = []; this.towers = []; this.bolts = []; this.shells = []; this.parts = []; this.nums = [];
    this.towerGrid = [];
    for (let r = 0; r < ROWS; r++) this.towerGrid.push(new Array(COLS).fill(null));
    this.cx = 5; this.cy = 4;
    this.cpx = this.cx * T + T / 2; this.cpy = TOP + this.cy * T + T / 2;
    this.selType = 'blaster';
    this.animT = 0; this.simT = 0;
    this.heldCode = null; this.repeatT = 0;
    this.boss = null; this.coinPop = 0; this.bossShakeT = 0; this.cursorShake = 0;
    this._pp = {};
    this.previewKey = '';
  }

  setupInput() {
    const kb = this.input.keyboard;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown', this.onKeyDown, this);
    kb.on('keyup', this.onKeyUp, this);
    this.input.on('pointerdown', this.onPointer, this);
    this.onBlur = () => { this.heldCode = null; };
    this.game.events.on('blur', this.onBlur);
    this.events.once('shutdown', () => { this.game.events.off('blur', this.onBlur); });
  }

  // ---------------------------------------------------------------- textures
  genTextures() {
    const tx = this.textures;
    if (tx.exists('px')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false }, false);
    const gen = (key, w, h, fn) => { g.clear(); fn(g); g.generateTexture(key, w, h); };
    const poly = (n, r, rot, cx, cy) => { const p = []; for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } return p; };
    const OUT = 0x0d1118;

    // generic particles
    gen('px', 8, 8, g => { g.fillStyle(0xffffff); g.fillCircle(4, 4, 4); });
    gen('sq', 6, 6, g => { g.fillStyle(0xffffff); g.fillRect(0, 0, 6, 6); });
    gen('ring', 132, 132, g => { g.lineStyle(4, 0xffffff, 1); g.strokeCircle(66, 66, 63); });
    gen('shadow', 64, 28, g => { g.fillStyle(0x000000, 1); g.fillEllipse(32, 14, 62, 26); });
    gen('plus', 12, 12, g => { g.fillStyle(0xffffff); g.fillRect(4, 0, 4, 12); g.fillRect(0, 4, 12, 4); });
    gen('bolt', 16, 8, g => { g.fillStyle(0xffffff); g.fillRoundedRect(0, 1, 16, 6, 3); });
    gen('shell', 16, 16, g => { g.fillStyle(OUT); g.fillCircle(8, 8, 8); g.fillStyle(0x3a3f4a); g.fillCircle(8, 8, 6); g.fillStyle(0xff9a3c); g.fillCircle(8, 8, 3); g.fillStyle(0xffffff, 0.6); g.fillCircle(6, 6, 1.5); });
    gen('coin', 22, 22, g => { g.fillStyle(0x8a5a00); g.fillCircle(11, 11, 11); g.fillStyle(0xffd84a); g.fillCircle(11, 11, 9); g.fillStyle(0xffec9a); g.fillCircle(11, 11, 5); g.fillStyle(0xffd84a); g.fillRect(10, 6, 2, 10); });
    gen('heart', 24, 22, g => {
      g.fillStyle(OUT); g.fillCircle(7, 8, 7); g.fillCircle(17, 8, 7); g.fillTriangle(0, 10, 24, 10, 12, 22);
      g.fillStyle(0xff5a5a); g.fillCircle(7, 8, 5); g.fillCircle(17, 8, 5); g.fillTriangle(2.5, 10, 21.5, 10, 12, 19);
      g.fillStyle(0xffffff, 0.55); g.fillCircle(6, 6, 2);
    });
    gen('lock', 28, 32, g => {
      g.lineStyle(7, OUT); g.beginPath(); g.arc(14, 13, 8, Math.PI, 0); g.strokePath();
      g.lineStyle(3.5, 0xc9d3e0); g.beginPath(); g.arc(14, 13, 8, Math.PI, 0); g.strokePath();
      g.lineStyle(7, OUT); g.lineBetween(6, 13, 6, 16); g.lineBetween(22, 13, 22, 16);
      g.lineStyle(3.5, 0xc9d3e0); g.lineBetween(6, 13, 6, 16); g.lineBetween(22, 13, 22, 16);
      g.fillStyle(OUT); g.fillRoundedRect(1, 14, 26, 18, 4);
      g.fillStyle(0xffd84a); g.fillRoundedRect(3, 16, 22, 14, 3);
      g.fillStyle(0x8a5a00); g.fillCircle(14, 21, 2.6); g.fillRect(13, 22, 2, 5);
    });
    // bridge deck (vertical orientation, rotated for horizontal crossings)
    gen('bridge', 104, 104, g => {
      const c = 52;
      g.fillStyle(0x000000, 0.3); g.fillRect(c - 33 + 5, c - 47 + 6, 66, 94);
      g.fillStyle(OUT); g.fillRect(c - 34, c - 48, 68, 96);
      g.fillStyle(0x8a6a44); g.fillRect(c - 27, c - 46, 54, 92);
      for (let y = c - 46; y < c + 46; y += 9) {
        g.fillStyle(0x6e5234); g.fillRect(c - 27, y, 54, 2);
        g.fillStyle(0xa8845a); g.fillRect(c - 27, y + 2, 54, 1);
      }
      g.fillStyle(0xc9a070); g.fillRect(c - 32, c - 46, 5, 92); g.fillRect(c + 27, c - 46, 5, 92);
      g.fillStyle(0x5a3f22);
      for (const y of [-43, -15, 15, 43]) { g.fillRect(c - 34, c + y - 4, 8, 8); g.fillRect(c + 26, c + y - 4, 8, 8); }
    });

    // enemies
    gen('e_runner', 32, 32, g => {
      const p = [{ x: 29, y: 16 }, { x: 5, y: 4 }, { x: 10, y: 16 }, { x: 5, y: 28 }];
      g.fillStyle(0xffd84a); g.fillPoints(p, true); g.lineStyle(3, OUT); g.strokePoints(p, true);
      g.fillStyle(0xfff2b0); g.fillTriangle(22, 16, 10, 10, 13, 16);
    });
    gen('e_grunt', 34, 34, g => {
      g.fillStyle(OUT); g.fillCircle(17, 17, 16); g.fillStyle(0xff5a5a); g.fillCircle(17, 17, 13.5);
      g.fillStyle(0xff9a9a); g.fillCircle(13, 12, 4.5); g.fillStyle(OUT); g.fillCircle(21, 16, 2.2); g.fillCircle(25, 18, 2.2);
    });
    gen('e_tank', 48, 48, g => {
      g.fillStyle(OUT); g.fillRoundedRect(3, 3, 42, 42, 10); g.fillStyle(0x7d8f6a); g.fillRoundedRect(6, 6, 36, 36, 8);
      g.lineStyle(2.5, 0xc2d1a8); g.strokeRoundedRect(12, 12, 24, 24, 4);
      g.fillStyle(0x5d6d4e); g.fillRect(16, 16, 16, 16);
      g.fillStyle(0xd9e4c4); [[10, 10], [38, 10], [10, 38], [38, 38]].forEach(([x, y]) => g.fillCircle(x, y, 2));
    });
    gen('e_swarm', 18, 18, g => { g.fillStyle(OUT); g.fillCircle(9, 9, 8.5); g.fillStyle(0xff7ac8); g.fillCircle(9, 9, 6.5); g.fillStyle(0xffc2e6); g.fillCircle(7, 7, 2); });
    gen('e_healer', 34, 34, g => {
      g.fillStyle(OUT); g.fillCircle(17, 17, 16); g.fillStyle(0x7fbf6a); g.fillCircle(17, 17, 13.5);
      g.fillStyle(0xffffff); g.fillRect(14.5, 8, 5, 18); g.fillRect(8, 14.5, 18, 5);
    });
    gen('e_boss', 96, 96, g => {
      const star = (ro, ri) => { const p = []; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; const r = i % 2 ? ri : ro; p.push({ x: 48 + Math.cos(a) * r, y: 48 + Math.sin(a) * r }); } return p; };
      g.fillStyle(OUT); g.fillPoints(star(47, 37), true);
      g.fillStyle(0x9b5cff); g.fillPoints(star(43, 34), true);
      g.fillStyle(0x6d34d0); g.fillCircle(48, 48, 29);
      g.lineStyle(3, 0xc9a0ff); g.strokeCircle(48, 48, 21);
      g.fillStyle(0xff7ac8); g.fillCircle(48, 48, 10); g.fillStyle(0xffffff, 0.8); g.fillCircle(45, 45, 3.5);
    });
    for (const k of Object.values(ENEMIES)) {
      const src = tx.get(k.tex).getSourceImage();
      const c = tx.createCanvas(k.tex + '_ice', src.width, src.height), cc = c.context;
      cc.drawImage(src, 0, 0);
      cc.globalCompositeOperation = 'source-atop';
      cc.fillStyle = 'rgba(174,227,255,0.62)'; cc.fillRect(0, 0, src.width, src.height);
      cc.fillStyle = 'rgba(255,255,255,0.35)'; cc.fillRect(0, 0, src.width, src.height * 0.35);
      cc.globalCompositeOperation = 'source-over';
      c.refresh();
    }
    for (let L = 1; L <= 3; L++) gen(`pips${L}`, 40, 12, g => {
      const x0 = 20 - (L - 1) * 5.5;
      for (let i = 0; i < L; i++) {
        const x = x0 + i * 11;
        g.fillStyle(OUT); g.fillPoints([{ x, y: 0 }, { x: x + 6, y: 6 }, { x, y: 12 }, { x: x - 6, y: 6 }], true);
        g.fillStyle(0xffd84a); g.fillPoints([{ x, y: 2.5 }, { x: x + 3.5, y: 6 }, { x, y: 9.5 }, { x: x - 3.5, y: 6 }], true);
      }
    });

    // towers
    for (let L = 1; L <= 3; L++) {
      const cx = 32, cy = 32;
      gen(`blaster_b${L}`, 64, 64, g => {
        const s = 34 + 5 * (L - 1);
        g.fillStyle(OUT); g.fillRoundedRect(cx - s / 2 - 2, cy - s / 2 - 2, s + 4, s + 4, 7);
        g.fillStyle(0x1d4f5e); g.fillRoundedRect(cx - s / 2, cy - s / 2, s, s, 6);
        g.lineStyle(2, 0x4ee6ff); g.strokeRoundedRect(cx - s / 2 + 2, cy - s / 2 + 2, s - 4, s - 4, 5);
        g.fillStyle(0x2a7c8f); g.fillRoundedRect(cx - s / 2 + 7, cy - s / 2 + 7, s - 14, s - 14, 4);
        if (L >= 2) { g.fillStyle(0x4ee6ff); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.fillCircle(cx + a * (s / 2 - 6), cy + b * (s / 2 - 6), 2.5)); }
        if (L >= 3) { g.lineStyle(2, 0xbff6ff, 0.9); g.strokeCircle(cx, cy, s / 2 - 9); }
      });
      gen(`blaster_t${L}`, 64, 64, g => {
        const offs = [[0], [-5, 5], [-8, 0, 8]][L - 1], len = 20 + 2 * L;
        for (const o of offs) {
          g.fillStyle(OUT); g.fillRect(cx, cy + o - 4, len + 2, 8);
          g.fillStyle(0xb6c6d8); g.fillRect(cx, cy + o - 3, len, 6);
          g.fillStyle(0x4ee6ff); g.fillRect(cx + len - 5, cy + o - 3, 5, 6);
        }
        g.fillStyle(OUT); g.fillCircle(cx, cy, 11 + L);
        g.fillStyle(0x4ee6ff); g.fillCircle(cx, cy, 9 + L);
        g.fillStyle(0x1d4f5e); g.fillCircle(cx, cy, 4 + L * 0.5);
        g.fillStyle(0xffffff, 0.5); g.fillCircle(cx - 3, cy - 3, 2.5);
      });
      gen(`mortar_b${L}`, 64, 64, g => {
        const R = 19 + 3 * (L - 1), rot = Math.PI / 8;
        g.fillStyle(OUT); g.fillPoints(poly(8, R + 2, rot, cx, cy), true);
        g.fillStyle(0x6e3b17); g.fillPoints(poly(8, R, rot, cx, cy), true);
        g.lineStyle(3, 0xff9a3c); g.strokePoints(poly(8, R - 2.5, rot, cx, cy), true);
        g.fillStyle(0x8a4a1d); g.fillPoints(poly(8, R - 7, rot, cx, cy), true);
        if (L >= 2) { g.lineStyle(2, 0xffc58a, 0.9); g.strokeCircle(cx, cy, R - 10); }
        if (L >= 3) { g.fillStyle(0xffe0b0); poly(8, R - 4.5, 0, cx, cy).forEach(p => g.fillCircle(p.x, p.y, 1.8)); g.lineStyle(1.5, 0xffe0b0, 0.8); g.strokeCircle(cx, cy, R - 13); }
      });
      gen(`mortar_t${L}`, 64, 64, g => {
        const tw = 14 + 2 * L, tl = 24 + 2 * L;
        g.fillStyle(OUT); g.fillRoundedRect(cx - 8, cy - tw / 2 - 2, tl + 4, tw + 4, 4);
        g.fillStyle(0x4a4f5c); g.fillRoundedRect(cx - 6, cy - tw / 2, tl, tw, 3);
        g.fillStyle(0xff9a3c); g.fillRect(cx + 5, cy - tw / 2, 4, tw);
        if (L >= 2) g.fillRect(cx + 11, cy - tw / 2, 3, tw);
        if (L >= 3) { g.fillStyle(0xffd0a0); g.fillRect(cx - 6, cy - tw / 2, tl, 2); }
        g.fillStyle(0x1e2128); g.fillRect(cx + tl - 11, cy - tw / 2 + 3, 4, tw - 6);
        g.fillStyle(OUT); g.fillCircle(cx - 2, cy, 9); g.fillStyle(0xff9a3c); g.fillCircle(cx - 2, cy, 7);
      });
      gen(`frost_b${L}`, 64, 64, g => {
        const R = 15 + 3 * (L - 1);
        const spikes = [];
        if (L === 1) [-90, 30, 150].forEach(a => spikes.push([a, 7, 4]));
        else if (L === 2) for (let i = 0; i < 6; i++) spikes.push([-90 + i * 60, 8, 4]);
        else { for (let i = 0; i < 6; i++) spikes.push([-90 + i * 60, 10, 4.5]); for (let i = 0; i < 6; i++) spikes.push([-60 + i * 60, 5, 3]); }
        const spikePts = (deg, len, w, grow) => {
          const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
          const b = R - 3, tip = R + len + grow;
          return [{ x: cx + ca * tip, y: cy + sa * tip }, { x: cx + ca * b - sa * (w + grow), y: cy + sa * b + ca * (w + grow) }, { x: cx + ca * b + sa * (w + grow), y: cy + sa * b - ca * (w + grow) }];
        };
        g.fillStyle(OUT); spikes.forEach(([a, l, w]) => g.fillPoints(spikePts(a, l, w, 1.5), true));
        g.fillStyle(0xd8f3ff); spikes.forEach(([a, l, w]) => g.fillPoints(spikePts(a, l, w, 0), true));
        const rot = -Math.PI / 2;
        g.fillStyle(OUT); g.fillPoints(poly(6, R + 2, rot, cx, cy), true);
        g.fillStyle(0x6fa8cc); g.fillPoints(poly(6, R, rot, cx, cy), true);
        g.fillStyle(0xaee3ff); g.fillPoints(poly(6, R - 4, rot, cx, cy), true);
        g.fillStyle(0xeefaff); g.fillPoints(poly(6, R * 0.45, rot, cx, cy), true);
        g.lineStyle(1.5, 0xffffff, 0.55);
        poly(6, R - 4, rot, cx, cy).forEach(p => g.lineBetween(cx, cy, p.x, p.y));
      });
    }

    const gc = tx.createCanvas('glow', 128, 128), gctx = gc.context;
    const gr = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = gr; gctx.fillRect(0, 0, 128, 128); gc.refresh();

    const vc = tx.createCanvas('vignette', W, H), vctx = vc.context, dd = 110;
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => { const l = vctx.createLinearGradient(x0, y0, x1, y1); l.addColorStop(0, 'rgba(255,40,40,0.85)'); l.addColorStop(1, 'rgba(255,40,40,0)'); vctx.fillStyle = l; vctx.fillRect(rx, ry, rw, rh); };
    edge(0, 0, 0, dd, 0, 0, W, dd); edge(0, H, 0, H - dd, 0, H - dd, W, dd); edge(0, 0, dd, 0, 0, 0, dd, H); edge(W, 0, W - dd, 0, W - dd, 0, dd, H);
    vc.refresh();

    const chars = '0123456789+', cw = 22, chh = 30;
    const dc = tx.createCanvas('digits', cw * chars.length, chh), dctx = dc.context;
    dctx.font = `bold 24px ${FONT}`; dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
    dctx.lineJoin = 'round'; dctx.lineWidth = 5; dctx.strokeStyle = '#0d1118'; dctx.fillStyle = '#ffffff';
    for (let i = 0; i < chars.length; i++) {
      const x = i * cw + cw / 2;
      dctx.strokeText(chars[i], x, chh / 2 + 1); dctx.fillText(chars[i], x, chh / 2 + 1);
      dc.add(chars[i], 0, i * cw, 0, cw, chh);
    }
    dc.refresh();
    g.destroy();
  }

  // Static scenery for one map, drawn once into a texture.
  genBoard(map) {
    const key = `board_${map.id}`;
    if (this.textures.exists(key)) return;
    const OUT = 0x0d1118;
    const g = this.make.graphics({ x: 0, y: 0, add: false }, false);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      g.fillStyle(((r + c) & 1) ? 0x2a3547 : 0x2e3a4e, 1); g.fillRect(c * T, r * T, T, T);
    }
    let seed = 1337 + map.id * 7919;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 160; i++) { g.fillStyle(rnd() < 0.5 ? 0x384761 : 0x232d3e, 0.9); g.fillCircle(rnd() * W, rnd() * BOARD_H, 1 + rnd() * 2.2); }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = rnd() * BOARD_H; g.lineStyle(1.5, 0x3d5068, 0.9);
      g.lineBetween(x, y, x - 3, y - 5); g.lineBetween(x, y, x, y - 6); g.lineBetween(x, y, x + 3, y - 5);
    }
    g.lineStyle(1, 0x1b2230, 0.4);
    for (let c = 1; c < COLS; c++) g.lineBetween(c * T, 0, c * T, BOARD_H);
    for (let r = 1; r < ROWS; r++) g.lineBetween(0, r * T, W, r * T);
    const lanePts = map.lanes.map(l => l.pts.map(p => ({ x: p.x, y: p.y - TOP })));
    const band = (hw, color, ox, oy) => {
      g.fillStyle(color, 1);
      for (const pts of lanePts) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (a.y === b.y) g.fillRect(Math.min(a.x, b.x) + ox, a.y - hw + oy, Math.abs(b.x - a.x), hw * 2);
          else g.fillRect(a.x - hw + ox, Math.min(a.y, b.y) + oy, hw * 2, Math.abs(b.y - a.y));
        }
        for (let i = 1; i < pts.length - 1; i++) g.fillCircle(pts[i].x + ox, pts[i].y + oy, hw);
      }
    };
    band(31, 0x1f2838, 0, 4);
    band(29, 0x8a7654, 0, 0);
    band(25, 0xc9b48a, 0, 3);
    band(15, 0xd2bf95, 0, 4);
    for (let i = 0; i < 90 * map.lanes.length; i++) {
      const lane = map.lanes[Math.floor(rnd() * map.lanes.length)];
      const s = lane.segs[Math.floor(rnd() * lane.segs.length)], k = rnd() * s.len, off = (rnd() * 2 - 1) * 18;
      const x = s.ax + s.dx * k - s.dy * off, y = s.ay - TOP + s.dy * k + s.dx * off + 3;
      g.fillStyle(rnd() < 0.5 ? 0xa8946c : 0xe0d0aa, 1); g.fillCircle(x, y, 1.2 + rnd() * 1.8);
    }
    const gate = (x, y, col, dark, dir) => {
      const px = dir > 0 ? x : x - 18;
      g.fillStyle(OUT); g.fillRoundedRect(px - 1, y - 45, 20, 18, 4); g.fillRoundedRect(px - 1, y + 27, 20, 18, 4);
      g.fillStyle(dark); g.fillRoundedRect(px + 1, y - 43, 16, 14, 3); g.fillRoundedRect(px + 1, y + 29, 16, 14, 3);
      g.fillStyle(col); g.fillCircle(px + 9, y - 36, 3.5); g.fillCircle(px + 9, y + 36, 3.5);
      g.fillStyle(col, 0.85); g.fillRect(px + 6, y - 28, 6, 56);
      g.fillStyle(0xffffff, 0.7); g.fillRect(px + 8, y - 26, 2, 52);
    };
    for (const lane of map.lanes) gate(0, lane.spawn.y - TOP, 0xff5a5a, 0x4a2430, 1);
    gate(W, map.exit.y - TOP, 0x4ee6ff, 0x1d4f5e, -1);
    g.generateTexture(key, W, BOARD_H);
    g.destroy();
  }

  makeGates() {
    const objs = [];
    for (const lane of this.map.lanes) objs.push(this.add.image(10, lane.spawn.y, 'glow').setBlendMode(ADD).setTint(0xff5a5a).setScale(1.1, 1.3).setDepth(D.gate).setAlpha(0.4));
    objs.push(this.add.image(W - 10, this.map.exit.y, 'glow').setBlendMode(ADD).setTint(0x4ee6ff).setScale(1.1, 1.3).setDepth(D.gate).setAlpha(0.4));
    this.tweens.add({ targets: objs, alpha: 0.75, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // ---------------------------------------------------------------- pools
  makePool(max, depth) { return { free: [], count: 0, max, depth }; }
  getImg(pool, key, frame) {
    let img = pool.free.pop();
    if (img) img.setTexture(key, frame);
    else {
      if (pool.count >= pool.max) return null;
      img = this.add.image(0, 0, key, frame); pool.count++;
    }
    img.setVisible(true).setAlpha(1).setScale(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.NORMAL).setDepth(pool.depth).setOrigin(0.5);
    return img;
  }
  relImg(pool, img) { img.setVisible(false); pool.free.push(img); }

  // ---------------------------------------------------------------- UI builders
  txt(x, y, s, size, color, extra = {}) {
    return this.add.text(x, y, s, Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#0d1118', strokeThickness: Math.max(3, Math.round(size / 6)) }, extra));
  }

  makeHUD() {
    this.add.rectangle(0, 0, W, TOP, 0x141a26).setOrigin(0).setDepth(D.hud);
    this.add.rectangle(0, TOP - 2, W, 2, 0x34425a).setOrigin(0).setDepth(D.hud);
    this.hudCoin = this.add.image(24, 26, 'coin').setDepth(D.hud + 1);
    this.goldText = this.txt(42, 26, String(this.gold), 24, '#ffd84a').setOrigin(0, 0.5).setDepth(D.hud + 1);
    this.add.image(150, 27, 'heart').setDepth(D.hud + 1);
    this.livesText = this.txt(168, 26, '20', 24, '#ff8a8a').setOrigin(0, 0.5).setDepth(D.hud + 1);
    this.levelText = this.txt(240, 15, `LEVEL ${this.mapIdx}/${MAPS.length} · ${this.map.name.toUpperCase()}`, 13, '#c9a0ff', { strokeThickness: 3 }).setOrigin(0, 0.5).setDepth(D.hud + 1);
    this.waveText = this.txt(240, 36, 'WAVE 1/10', 20, '#e6eef8').setOrigin(0, 0.5).setDepth(D.hud + 1);
    this.scoreText = this.txt(440, 26, 'SCORE 0', 22, '#c9b48a').setOrigin(0, 0.5).setDepth(D.hud + 1);
    this.statusText = this.txt(W - 14, 26, '', 18, '#aee3ff').setOrigin(1, 0.5).setDepth(D.hud + 1);
  }

  makePanel() {
    const y0 = PANEL_Y;
    this.add.rectangle(0, y0, W, PANEL_H, 0x141a26).setOrigin(0).setDepth(D.hud);
    this.add.rectangle(0, y0, W, 2, 0x34425a).setOrigin(0).setDepth(D.hud);
    this.cards = [];
    TOWER_ORDER.forEach((type, i) => {
      const d = TOWERS[type], x = 10 + i * 156, y = y0 + 10;
      const bg = this.add.rectangle(x, y, 148, 100, 0x1f2838).setOrigin(0).setStrokeStyle(2, 0x34425a).setDepth(D.hud + 1);
      const ib = this.add.image(x + 30, y + 50, `${type}_b1`).setScale(0.85).setDepth(D.hud + 2);
      const parts = [bg, ib];
      if (type !== 'frost') parts.push(this.add.image(x + 30, y + 50, `${type}_t1`).setScale(0.85).setRotation(-0.5).setDepth(D.hud + 3));
      parts.push(this.txt(x + 60, y + 30, `[${d.key}] ${d.name}`, 16, '#e6eef8').setOrigin(0, 0.5).setDepth(D.hud + 2));
      parts.push(this.txt(x + 60, y + 64, `${d.cost}g`, 24, '#ffd84a').setOrigin(0, 0.5).setDepth(D.hud + 2));
      this.cards.push({ type, bg, parts, x, y, afford: null });
    });
    this.selShown = null;
    this.infoText = this.txt(482, y0 + 10, '', 14, '#dfe8f5', { lineSpacing: 5, strokeThickness: 3 }).setDepth(D.hud + 1);
    this.infoShown = null;
    this.txt(482, y0 + 92, 'Space: next wave  ·  P: pause', 13, '#7f91ab', { strokeThickness: 3 }).setDepth(D.hud + 1);
    this.add.rectangle(708, y0 + 8, 306, 104, 0x1f2838).setOrigin(0).setStrokeStyle(2, 0x34425a).setDepth(D.hud + 1);
    this.pvTitle = this.txt(720, y0 + 28, '', 17, '#e6eef8').setOrigin(0, 0.5).setDepth(D.hud + 2);
    this.pvLabel = this.txt(1002, y0 + 28, '', 16, '#ffffff').setOrigin(1, 0.5).setDepth(D.hud + 2);
    this.previewItems = [];
  }

  buildPreview(n, final) {
    this.previewItems.forEach(o => o.destroy());
    this.previewItems = [];
    const wd = this.map.waves[n - 1];
    this.pvTitle.setText(final ? `FINAL WAVE ${n}/10` : `NEXT: WAVE ${n}`);
    this.pvLabel.setText(wd.label).setColor(LABEL_COLORS[wd.label] || '#ffffff');
    const counts = new Map();
    for (const [type, c] of wd.groups) counts.set(type, (counts.get(type) || 0) + c);
    const list = [...counts.entries()];
    list.sort((a, b) => (b[0] === 'boss') - (a[0] === 'boss'));
    let x = 720;
    for (const [type, cnt] of list) {
      const tex = ENEMIES[type].tex, f = this.textures.getFrame(tex);
      const img = this.add.image(x + 15, PANEL_Y + 76, tex).setDepth(D.hud + 2).setScale(Math.min(1, 30 / Math.max(f.width, f.height)));
      const t = this.txt(x + 33, PANEL_Y + 76, `x${cnt}`, 17, '#e6eef8').setOrigin(0, 0.5).setDepth(D.hud + 2);
      this.previewItems.push(img, t);
      x += 72;
    }
  }

  makeBossBar() {
    const y = TOP + 20, bw = 560;
    this.bossBg = this.add.rectangle(W / 2, y, bw + 8, 24, 0x0d1118, 0.9).setStrokeStyle(2, 0x9b5cff).setDepth(D.banner);
    this.bossTrail = this.add.rectangle(W / 2 - bw / 2, y, bw, 16, 0xffffff, 0.8).setOrigin(0, 0.5).setDepth(D.banner);
    this.bossFill = this.add.rectangle(W / 2 - bw / 2, y, bw, 16, 0x9b5cff).setOrigin(0, 0.5).setDepth(D.banner);
    this.bossLabel = this.txt(W / 2, y, this.map.boss, 14, '#ffffff').setOrigin(0.5).setDepth(D.banner);
    this.bossParts = [this.bossBg, this.bossTrail, this.bossFill, this.bossLabel];
    this.bossTrailV = 1;
    this.bossParts.forEach(p => p.setVisible(false));
  }

  makeBanner() {
    this.banner = this.txt(W / 2, TOP + BOARD_H / 2 - 30, '', 52, '#ffffff').setOrigin(0.5).setDepth(D.banner).setAlpha(0);
    this.bannerSub = this.txt(W / 2, TOP + BOARD_H / 2 + 22, '', 22, '#c9b48a').setOrigin(0.5).setDepth(D.banner).setAlpha(0);
  }
  showBanner(a, b, color = '#ffffff') {
    const tg = [this.banner, this.bannerSub];
    this.tweens.killTweensOf(tg);
    this.banner.setText(a).setColor(color); this.bannerSub.setText(b || '');
    tg.forEach(o => o.setAlpha(0).setScale(0.7));
    this.tweens.add({ targets: tg, alpha: 1, scale: 1, duration: 320, ease: 'Back.out' });
    this.tweens.add({ targets: tg, alpha: 0, duration: 450, delay: 1900 });
  }

  makeOverlays() {
    // Menu
    this.menuO = this.add.container(0, 0).setDepth(D.overlay);
    const mt = this.txt(W / 2, 120, 'Tiny Bastion', 80, '#4ee6ff', { strokeThickness: 10 }).setOrigin(0.5);
    const ms = this.txt(W / 2, 190, 'Hold the path across 4 maps of 10 waves', 24, '#c9b48a').setOrigin(0.5);
    this.menuO.add([this.add.rectangle(0, 0, W, H, 0x0d1118, 0.8).setOrigin(0), mt, ms]);
    // level cards
    this.levelCards = [];
    const cw = 232, ch = 104, gap = 12, x0 = W / 2 - (4 * cw + 3 * gap) / 2, y = 240;
    MAPS.forEach((m, i) => {
      const x = x0 + i * (cw + gap);
      const bg = this.add.rectangle(x, y, cw, ch, 0x1f2838).setOrigin(0).setStrokeStyle(2, 0x34425a);
      const num = this.txt(x + 14, y + 22, `${i + 1}`, 26, '#ffd84a').setOrigin(0, 0.5);
      const name = this.txt(x + 42, y + 22, m.name, 20, '#e6eef8').setOrigin(0, 0.5);
      const tag = this.txt(x + 14, y + 52, m.tag, 14, '#aee3ff', { strokeThickness: 3 }).setOrigin(0, 0.5);
      const pips = [];
      for (let k = 0; k < 4; k++) pips.push(this.add.rectangle(x + 14 + k * 20, y + 82, 14, 10, k <= i ? 0xff9a3c : 0x34425a).setOrigin(0, 0.5).setStrokeStyle(1.5, 0x0d1118));
      const lock = this.add.image(x + cw - 24, y + 24, 'lock');
      const lockTxt = this.txt(x + cw - 12, y + 82, 'LOCKED', 13, '#ff9a9a', { strokeThickness: 3 }).setOrigin(1, 0.5);
      this.menuO.add([bg, num, name, tag, ...pips, lock, lockTxt]);
      this.levelCards.push({ bg, items: [num, name, tag, ...pips], lock, lockTxt });
    });
    this.menuHint = this.txt(W / 2, 372, 'Keys 1-4: choose a level', 18, '#7f91ab').setOrigin(0.5);
    this.menuPrompt = this.txt(W / 2, 420, 'Press Enter to start', 34, '#ffd84a').setOrigin(0.5);
    const mc = this.txt(W / 2, 540,
      'Arrows: move cursor    1 / 2 / 3: build Blaster / Mortar / Frost\n' +
      'U: upgrade    S: sell (60% refund)    Space: send wave early (+gold, but tougher)\n' +
      'P: pause    Mouse click: place last selected tower',
      17, '#aee3ff', { align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    this.menuO.add([this.menuHint, this.menuPrompt, mc]);
    this.tweens.add({ targets: this.menuPrompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.refreshMenu();

    // Pause
    this.pauseO = this.add.container(0, 0).setDepth(D.overlay).setVisible(false);
    this.pauseO.add([
      this.add.rectangle(0, 0, W, H, 0x0d1118, 0.6).setOrigin(0),
      this.txt(W / 2, H / 2 - 30, 'PAUSED', 72, '#ffffff', { strokeThickness: 10 }).setOrigin(0.5),
      this.txt(W / 2, H / 2 + 40, 'Press P to resume', 24, '#aee3ff').setOrigin(0.5),
    ]);

    // End screen
    this.endO = this.add.container(0, 0).setDepth(D.overlay).setVisible(false);
    this.endTitle = this.txt(W / 2, 240, '', 84, '#ffd84a', { strokeThickness: 10 }).setOrigin(0.5);
    this.endStats = this.txt(W / 2, 370, '', 26, '#e6eef8', { align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    this.endPrompt = this.txt(W / 2, 500, 'Press Enter to play again', 30, '#ffd84a').setOrigin(0.5);
    this.endO.add([this.add.rectangle(0, 0, W, H, 0x0d1118, 0.75).setOrigin(0), this.endTitle, this.endStats, this.endPrompt]);

    // Level complete screen (state stays 'playing')
    this.levelO = this.add.container(0, 0).setDepth(D.overlay).setVisible(false);
    this.lvTitle = this.txt(W / 2, 230, 'LEVEL COMPLETE', 72, '#7fdc6a', { strokeThickness: 10 }).setOrigin(0.5);
    this.lvStats = this.txt(W / 2, 360, '', 26, '#e6eef8', { align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    this.lvPrompt = this.txt(W / 2, 500, 'Press Enter for the next level', 30, '#ffd84a').setOrigin(0.5);
    this.levelO.add([this.add.rectangle(0, 0, W, H, 0x0d1118, 0.75).setOrigin(0), this.lvTitle, this.lvStats, this.lvPrompt]);
  }

  refreshMenu() {
    this.levelCards.forEach((cd, i) => {
      const open = i + 1 <= this.unlocked, sel = i + 1 === this.menuSel;
      cd.bg.setStrokeStyle(sel ? 3 : 2, sel ? 0xffd84a : 0x34425a, 1).setFillStyle(sel ? 0x2b3850 : 0x1f2838);
      cd.items.forEach(o => o.setAlpha(open ? 1 : 0.4));
      cd.bg.setAlpha(open ? 1 : 0.6);
      cd.lock.setVisible(!open); cd.lockTxt.setVisible(!open);
    });
  }

  makeFloatTexts() {
    this.floats = [];
    for (let i = 0; i < 10; i++) {
      const t = this.txt(0, 0, '', 20, '#ffffff').setOrigin(0.5).setDepth(D.banner + 1).setVisible(false);
      this.floats.push({ t, life: 0, max: 1, x: 0, y: 0, color: '#ffffff', size: 20, boxed: false });
    }
  }
  floatText(x, y, str, color, size = 20, boxed = false) {
    let f = this.floats.find(o => o.life <= 0);
    if (!f) f = this.floats.reduce((a, b) => (a.life < b.life ? a : b));
    x = clamp(x, 70, W - 70);
    f.t.setText(str);
    if (f.color !== color) { f.t.setColor(color); f.color = color; }
    if (f.size !== size) { f.t.setFontSize(size); f.size = size; }
    if (f.boxed !== boxed) {
      f.boxed = boxed;
      f.t.setBackgroundColor(boxed ? 'rgba(13,17,24,0.9)' : null);
      f.t.setPadding(boxed ? 8 : 0, boxed ? 4 : 0);
      f.t.setStroke('#0d1118', boxed ? 5 : Math.max(3, Math.round(size / 6)));
    }
    f.t.setPosition(x, y).setVisible(true).setAlpha(1).setScale(1);
    f.x = x; f.y = y; f.life = f.max = 1.2;
  }

  // ---------------------------------------------------------------- state changes
  showMenu() {
    this.state = 'menu';
    this.menuO.setVisible(true);
  }
  startGame() {
    this.state = 'playing';
    this.menuO.setVisible(false); this.endO.setVisible(false); this.levelO.setVisible(false);
    const twin = this.map.lanes.length > 1;
    this.showBanner(`LEVEL ${this.mapIdx}: ${this.map.name.toUpperCase()}`,
      twin ? 'Two gates! Enemies split between lanes  ·  Space: start Wave 1' : 'Build your defenses  ·  Space: start Wave 1 now', '#4ee6ff');
    Sfx.place();
  }
  pauseGame() {
    this.state = 'paused';
    this.pauseO.setVisible(true);
    this.tweens.pauseAll();
  }
  resumeGame() {
    this.state = 'playing';
    this.pauseO.setVisible(false);
    this.tweens.resumeAll();
  }
  lose() {
    if (this.state !== 'playing') return;
    this.lives = 0;
    this.state = 'lost';
    Sfx.defeat();
    this.cameras.main.shake(500, 0.015, true);
    this.endTitle.setText('DEFEAT').setColor('#ff5a5a');
    this.endStats.setText(`Level ${this.mapIdx}: ${this.map.name}\nWave reached: ${Math.max(1, this.wave)}/10\nScore: ${this.score}`);
    this.endPrompt.setText('Press Enter to restart from Level 1');
    this.showEnd(this.endO);
  }
  celebrate() {
    Sfx.victory();
    const cols = [0x4ee6ff, 0xffd84a, 0xff7ac8, 0x7fbf6a, 0xff9a3c];
    for (let i = 0; i < 5; i++) this.burst(rand(150, W - 150), rand(TOP + 100, TOP + 400), cols[i], 16, 320);
  }
  finishLevel() {
    if (this.mapIdx < MAPS.length) this.completeLevel(); else this.win();
  }
  completeLevel() {
    if (this.state !== 'playing' || this.levelDone) return;
    this.levelDone = true;
    this.heldCode = null;
    const bonus = this.lives * 100;
    this.score += bonus;
    this.celebrate();
    if (!this._selftest) { saveUnlocked(this.mapIdx + 1); this.unlocked = loadUnlocked(); }
    const next = MAPS[this.mapIdx];
    this.lvStats.setText(`${this.map.name} cleared!\nLives left: ${this.lives}   (+${bonus})\nScore: ${this.score}\nNext: Level ${this.mapIdx + 1} · ${next.name}`);
    this.showEnd(this.levelO);
  }
  win() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    this.score += this.lives * 100;
    this.celebrate();
    this.endTitle.setText('VICTORY!').setColor('#ffd84a');
    this.endStats.setText(`All ${MAPS.length} levels conquered!\nLives left: ${this.lives}   (+${this.lives * 100})\nScore: ${this.score}`);
    this.endPrompt.setText('Press Enter to play again');
    this.showEnd(this.endO);
  }
  showEnd(o) {
    this.bossParts.forEach(p => p.setVisible(false));
    o.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: o, alpha: 1, duration: 450 });
  }

  // ---------------------------------------------------------------- input
  onKeyDown(e) {
    Sfx.init();
    if (e.repeat) return;
    const c = e.code, st = this.state;
    if (st === 'menu') {
      const n = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 }[c];
      if (n) {
        if (n <= this.unlocked) { if (this.menuSel !== n) { this.menuSel = n; this.refreshMenu(); } Sfx.tick(); }
        else Sfx.invalid();
        return;
      }
    }
    if (c === 'Enter') {
      if (st === 'menu') {
        if (this.menuSel !== this.mapIdx) this.scene.restart({ autostart: true, map: this.menuSel });
        else this.startGame();
      } else if (st === 'won' || st === 'lost') this.scene.restart({ autostart: true, map: 1 });
      else if (st === 'playing' && this.levelDone) this.scene.restart({ autostart: true, map: this.mapIdx + 1, score: this.score });
      return;
    }
    if (this.levelDone) return;
    if (c === 'KeyP') {
      if (st === 'playing') this.pauseGame(); else if (st === 'paused') this.resumeGame();
      return;
    }
    if (st !== 'playing') return;
    switch (c) {
      case 'ArrowUp': this.moveCursor(0, -1); this.heldCode = c; this.repeatT = 0.18; break;
      case 'ArrowDown': this.moveCursor(0, 1); this.heldCode = c; this.repeatT = 0.18; break;
      case 'ArrowLeft': this.moveCursor(-1, 0); this.heldCode = c; this.repeatT = 0.18; break;
      case 'ArrowRight': this.moveCursor(1, 0); this.heldCode = c; this.repeatT = 0.18; break;
      case 'Digit1': this.tryPlace('blaster'); break;
      case 'Digit2': this.tryPlace('mortar'); break;
      case 'Digit3': this.tryPlace('frost'); break;
      case 'KeyU': this.tryUpgrade(); break;
      case 'KeyS': this.trySell(); break;
      case 'Space': this.startNextWave(true); break;
      default: break;
    }
  }
  onKeyUp(e) { if (e.code === this.heldCode) this.heldCode = null; }
  handleRepeat(dt) {
    if (!this.heldCode) return;
    this.repeatT -= dt;
    let guard = 0;
    while (this.repeatT <= 0 && guard++ < 4) {
      const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[this.heldCode];
      if (m) this.moveCursor(m[0], m[1]);
      this.repeatT += 0.07;
    }
  }
  moveCursor(dx, dy) {
    const nx = clamp(this.cx + dx, 0, COLS - 1), ny = clamp(this.cy + dy, 0, ROWS - 1);
    if (nx === this.cx && ny === this.cy) return;
    this.cx = nx; this.cy = ny;
    Sfx.tick();
  }
  onPointer(p) {
    Sfx.init();
    if (this.state !== 'playing' || this.levelDone) return;
    const x = p.x, y = p.y;
    if (y >= TOP && y < PANEL_Y && x >= 0 && x < W) {
      this.cx = clamp(Math.floor(x / T), 0, COLS - 1);
      this.cy = clamp(Math.floor((y - TOP) / T), 0, ROWS - 1);
      this.tryPlace(this.selType);
    } else if (y >= PANEL_Y) {
      for (const cd of this.cards) {
        if (x >= cd.x && x <= cd.x + 148 && y >= cd.y && y <= cd.y + 100) { this.selType = cd.type; Sfx.tick(); }
      }
    }
  }

  // ---------------------------------------------------------------- tower actions
  invalid(msg) {
    Sfx.invalid();
    this.cursorShake = 0.25;
    if (msg) {
      const ty = this.cy === 0 ? TOP + T + 16 : TOP + this.cy * T - 14;
      this.floatText(this.cx * T + T / 2, ty, msg, '#ff9a9a', 17, true);
    }
  }
  addGold(n) { this.gold += n; }

  tryPlace(type) {
    const d = TOWERS[type];
    this.selType = type;
    if (this.map.grid[this.cy][this.cx]) return this.invalid("Can't build on the path");
    if (this.towerGrid[this.cy][this.cx]) return this.invalid('Tile occupied');
    if (this.gold < d.cost) return this.invalid(`Need ${d.cost}g`);
    this.gold -= d.cost;
    this.createTower(type, this.cx, this.cy);
  }

  createTower(type, c, r) {
    const x = c * T + T / 2, y = TOP + r * T + T / 2, d = TOWERS[type];
    const t = { type, level: 1, c, r, x, y, spent: d.cost, cd: 0.25, angle: -Math.PI / 2, recoil: 0, pulse: 0, flashT: 0, barrel: 0, stats: towerStats(type, 1), pop: { v: 0 } };
    t.shadow = this.add.image(x + 3, y + 16, 'shadow').setDepth(D.shadow).setAlpha(0.35).setScale(0.75, 0.8);
    t.glow = this.add.image(x, y, 'glow').setBlendMode(ADD).setTint(d.color).setAlpha(0).setDepth(D.tower - 0.1);
    t.base = this.add.image(x, y, `${type}_b1`).setDepth(D.tower).setScale(0);
    t.turret = type !== 'frost' ? this.add.image(x, y, `${type}_t1`).setDepth(D.tower + 0.1).setScale(0).setRotation(t.angle) : null;
    t.pips = this.add.image(x, y + 25, 'pips1').setDepth(D.tower + 0.2).setScale(0);
    this.towers.push(t);
    this.towerGrid[r][c] = t;
    this.tweens.add({ targets: t.pop, v: 1, duration: 300, ease: 'Back.out' });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.fx('px', x + Math.cos(a) * 18, y + Math.sin(a) * 18, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 5, life: 0.4, s0: 1, s1: 0.2, tint: 0xc9b48a });
    }
    this.fx('ring', x, y, { tint: d.color, s0: 0.2, s1: 0.6, life: 0.3, a: 0.8, depth: D.ground });
    Sfx.place();
  }

  tryUpgrade() {
    const t = this.towerGrid[this.cy][this.cx];
    if (!t) return this.invalid('No tower here');
    if (t.level >= 3) return this.invalid('MAX LEVEL');
    const cost = upgradeCost(t.type, t.level);
    if (this.gold < cost) return this.invalid(`Need ${cost}g`);
    this.gold -= cost;
    t.spent += cost;
    t.level++;
    t.stats = towerStats(t.type, t.level);
    t.base.setTexture(`${t.type}_b${t.level}`);
    if (t.turret) t.turret.setTexture(`${t.type}_t${t.level}`);
    t.pips.setTexture(`pips${t.level}`);
    t.base.setTintFill(0xffffff); t.flashT = 0.12;
    t.shadow.setScale(0.75 + 0.1 * (t.level - 1), 0.8 + 0.1 * (t.level - 1));
    this.tweens.killTweensOf(t.pop);
    t.pop.v = 1.35;
    this.tweens.add({ targets: t.pop, v: 1, duration: 280, ease: 'Quad.out' });
    const col = TOWERS[t.type].color;
    this.fx('ring', t.x, t.y, { tint: 0xffffff, s0: 0.2, s1: 0.9, life: 0.4, a: 1 });
    this.fx('ring', t.x, t.y, { tint: col, s0: 0.1, s1: 1.4, life: 0.55, a: 0.9 });
    this.fx('glow', t.x, t.y, { tint: col, add: true, s0: 0.5, s1: 1.4, life: 0.35, a: 0.9 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(80, 200);
      this.fx('sq', t.x, t.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, drag: 3, life: rand(0.4, 0.7), s0: 1, s1: 0.2, tint: i % 2 ? col : 0xffffff, vr: rand(-8, 8) });
    }
    this.floatText(t.x, t.y - 30, `LV ${t.level}!`, '#ffffff', 20);
    Sfx.upgrade();
  }

  trySell() {
    const t = this.towerGrid[this.cy][this.cx];
    if (!t) return this.invalid('No tower here');
    const refund = Math.floor(t.spent * 0.6);
    this.gold += refund;
    this.towerGrid[t.r][t.c] = null;
    const i = this.towers.indexOf(t); if (i >= 0) this.towers.splice(i, 1);
    this.tweens.killTweensOf(t.pop);
    const objs = [t.base, t.turret, t.glow, t.shadow, t.pips].filter(Boolean);
    this.tweens.add({ targets: objs, scale: 0, alpha: 0, duration: 240, ease: 'Back.in', onComplete: () => objs.forEach(o => o.destroy()) });
    this.floatText(t.x, t.y - 24, `+${refund}g`, '#ffd84a', 22);
    for (let k = 0; k < 3; k++) this.fx('coin', t.x + rand(-10, 10), t.y + rand(-10, 10), { home: { x: 24, y: 26 }, life: 0.55 + k * 0.08, s0: 0.9, s1: 0.7, depth: D.banner });
    Sfx.coin(); Sfx.sell();
  }

  // ---------------------------------------------------------------- waves
  startNextWave(early) {
    if (this.spawning || this.wave >= TOTAL_WAVES) return false;
    let heat = 0;
    if (early && this.countdownActive && this.wave >= 1) {
      heat = rushHeat(this.countdown);
      const bonus = Math.floor(Math.max(0, this.countdown)) * EARLY_GOLD_PER_SEC;
      if (bonus > 0) {
        this.addGold(bonus);
        this.floatText(W - 170, TOP + 26, `+${bonus}g early bonus!`, '#ffd84a', 22);
        Sfx.coin();
      }
    }
    this.wave++;
    this.countdownActive = false;
    this.spawning = true;
    this.spawnClock = 0;
    this.rushHp[this.wave] = 1 + RUSH_HP * heat;
    this.spawnQueue = buildQueue(this.map, this.wave, 1 - RUSH_PACK * heat);
    this.waveAlive[this.wave] = this.waveAlive[this.wave] || 0;
    const wd = this.map.waves[this.wave - 1];
    if (heat > 0.05) this.showBanner(`WAVE ${this.wave} RUSHED`, `${wd.label}  ·  +${Math.round(RUSH_HP * heat * 100)}% HP, packed tight`, '#ff9a3c');
    else this.showBanner(`WAVE ${this.wave}`, wd.label, LABEL_COLORS[wd.label] || '#ffffff');
    Sfx.waveStart();
    return true;
  }

  checkWaveClear(w) {
    if (!w || !this.waveSpawnDone[w] || this.waveCleared[w] || (this.waveAlive[w] || 0) > 0) return;
    this.waveCleared[w] = true;
    this.addGold(25);
    this.score += 50 * w;
    this.floatText(W / 2, TOP + 90, `WAVE ${w} CLEARED  +25g`, '#7fdc6a', 26);
    Sfx.coin();
  }

  // ---------------------------------------------------------------- enemies
  spawnEnemy(type, wave, laneIdx = 0) {
    const m = this.map, d = ENEMIES[type], isBoss = type === 'boss';
    const lane = m.lanes[laneIdx] || m.lanes[0];
    const hp = d.hp * HP_MULT[wave - 1] * (isBoss ? m.bossMult : m.hpScale) * (this.rushHp[wave] || 1);
    const e = {
      type, wave, hp, maxHp: hp, armor: isBoss ? m.bossArmor : d.armor, speed: d.speed, r: d.r, bounty: d.bounty, color: d.color, tex: d.tex,
      lane, laneIdx: m.lanes.indexOf(lane), dist: 0, rem: lane.len, x: 0, y: 0, off: type === 'swarm' ? rand(-13, 13) : isBoss ? 0 : rand(-5, 5),
      slowAmt: 0, slowT: 0, flash: 0, tm: 0, healT: 1 + Math.random(), iceT: Math.random() * 0.3, dead: false, onBridge: false,
      baseDepth: isBoss ? D.enemy + 0.2 : D.enemy,
    };
    const P = pathAt(lane, 0, this._pp);
    e.x = P.x + P.px * e.off; e.y = P.y + P.py * e.off;
    e.shadow = this.add.image(e.x + 3, e.y + e.r * 0.75, 'shadow').setDepth(D.shadow).setAlpha(0.35).setScale(e.r * 2.2 / 64, e.r * 0.9 / 28);
    e.spr = this.add.image(e.x, e.y, d.tex).setDepth(e.baseDepth);
    this.enemies.push(e);
    this.waveAlive[wave] = (this.waveAlive[wave] || 0) + 1;
    if (isBoss) {
      this.boss = e;
      this.bossTrailV = 1;
      this.bossParts.forEach(p => p.setVisible(true));
      this.cameras.main.shake(600, 0.014, true);
      this._bossSpawned = true;
      this._bossBarShown = this.bossBg.visible;
      this._bossShake = this.cameras.main.shakeEffect.isRunning;
      Sfx.boss();
      this.showBanner(m.boss, 'A boss approaches!', '#c9a0ff');
      this.fx('glow', 20, lane.spawn.y, { tint: 0x9b5cff, add: true, s0: 1, s1: 3, life: 0.6, a: 0.9 });
      this.fx('ring', 20, lane.spawn.y, { tint: 0x9b5cff, s0: 0.3, s1: 3, life: 0.7, a: 1 });
    } else if (this.parts.length < 200) {
      this.fx('glow', 12, lane.spawn.y, { tint: 0xff5a5a, add: true, s0: 0.3, s1: 0.6, life: 0.25, a: 0.7 });
    }
  }

  removeEnemy(e) {
    e.dead = true;
    e.spr.destroy(); e.shadow.destroy();
    this.waveAlive[e.wave] = Math.max(0, (this.waveAlive[e.wave] || 0) - 1);
    if (e === this.boss) { this.boss = null; this.bossParts.forEach(p => p.setVisible(false)); }
    this.checkWaveClear(e.wave);
  }

  dealDamage(e, amount, tint, noNum) {
    if (e.dead) return 0;
    const dmg = Math.max(1, amount - e.armor);
    e.hp -= dmg;
    e.flash = 0.06;
    Sfx.hit();
    if (!noNum) this.spawnNumber(e.x, e.y - e.r - 26, dmg, tint, e.type === 'boss' ? 1.15 : 1);
    if (e.type === 'boss' && dmg >= 30 && this.bossShakeT <= 0) { this.cameras.main.shake(120, 0.005); this.bossShakeT = 0.35; }
    if (e.hp <= 0) this.kill(e);
    return dmg;
  }

  applySlow(e, amt, dur) {
    if (e.dead) return;
    if (amt > e.slowAmt + 1e-6) { e.slowAmt = amt; e.slowT = dur; }
    else if (Math.abs(amt - e.slowAmt) < 1e-6) e.slowT = Math.max(e.slowT, dur);
  }

  kill(e) {
    if (e.dead) return;
    this.kills++;
    this.addGold(e.bounty);
    this.score += e.bounty * 10;
    const boss = e.type === 'boss';
    this.burst(e.x, e.y, e.color, boss ? 40 : e.type === 'swarm' ? 5 : 12, boss ? 380 : 190);
    if (this.parts.length < 260) this.fx('glow', e.x, e.y, { tint: e.color, add: true, s0: e.r / 40, s1: e.r / 20, life: 0.2, a: 0.8 });
    this.fx('coin', e.x, e.y, { home: { x: 24, y: 26 }, life: 0.65, s0: 0.9, s1: 0.7, depth: D.banner });
    Sfx.death();
    if (boss) {
      this.cameras.main.shake(800, 0.02, true);
      for (let i = 0; i < 3; i++) this.fx('ring', e.x, e.y, { tint: i === 1 ? 0xffffff : 0x9b5cff, s0: 0.3, s1: 3 + i, life: 0.6 + i * 0.2, a: 1 });
      this.showBanner(`${this.map.boss} DEFEATED`, '', '#ffd84a');
      Sfx.explode();
    }
    this.removeEnemy(e);
  }

  leak(e) {
    if (e.dead) return;
    const cost = e.type === 'boss' ? 5 : 1;
    this.leaks++;
    this.lives = Math.max(0, this.lives - cost);
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(0.9);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 550, ease: 'Quad.out' });
    this.cameras.main.shake(e.type === 'boss' ? 400 : 180, e.type === 'boss' ? 0.014 : 0.006);
    Sfx.lifeLost();
    this.floatText(W - 60, this.map.exit.y - 22, `-${cost}`, '#ff5a5a', 26);
    this.removeEnemy(e);
    if (this.lives <= 0) this.lose();
  }

  updateEnemies(dt) {
    const P = this._pp, br = this.map.bridge;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slowAmt = 0; } }
      e.dist += e.speed * T * (1 - e.slowAmt) * dt;
      e.rem = e.lane.len - e.dist;
      if (e.dist >= e.lane.len) {
        this.leak(e);
        if (this.state !== 'playing') return;
        continue;
      }
      pathAt(e.lane, e.dist, P);
      e.x = P.x + P.px * e.off; e.y = P.y + P.py * e.off;
      e.spr.setPosition(e.x, e.y);
      e.shadow.setPosition(e.x + 3, e.y + e.r * 0.75);
      if (br && e.laneIdx === 0) {
        const on = Math.abs(e.dist - br.d) < T * 0.85;
        if (on !== e.onBridge) { e.onBridge = on; e.spr.setDepth(e.baseDepth + (on ? 0.4 : 0)); }
      }
      if (e.type === 'runner') e.spr.setRotation(P.ang);
      else if (e.type === 'boss') { e.spr.rotation += dt * 0.5; e.spr.setScale(1 + 0.05 * Math.sin(this.simT * 5)); }
      if (e.flash > 0) e.flash -= dt;
      const mode = e.flash > 0 ? 2 : e.slowAmt > 0 ? 1 : 0;
      if (mode !== e.tm) {
        e.tm = mode;
        const want = e.slowAmt > 0 ? e.tex + '_ice' : e.tex;
        if (e.spr.texture.key !== want) e.spr.setTexture(want);
        if (mode === 2) e.spr.setTintFill(0xffffff);
        else e.spr.clearTint();
      }
      if (e.slowAmt > 0) {
        e.iceT -= dt;
        if (e.iceT <= 0) {
          e.iceT = 0.3;
          if (this.parts.length < 200) this.fx('sq', e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), { vy: -14, life: 0.5, s0: 0.8, s1: 0.2, tint: 0xe6f6ff, vr: 4 });
        }
      }
      if (e.type === 'healer') {
        e.healT -= dt;
        if (e.healT <= 0) { e.healT = 2; this.healPulse(e); }
      }
    }
  }

  healPulse(h) {
    const R = 1.5 * T, R2 = R * R;
    this.fx('ring', h.x, h.y, { tint: 0x7fdc6a, s0: 0.3, s1: R / 63, life: 0.5, a: 0.8, depth: D.ground });
    let any = false, healed = 0;
    for (const e of this.enemies) {
      if (e === h || e.dead || e.hp >= e.maxHp) continue;
      const dx = e.x - h.x, dy = e.y - h.y;
      if (dx * dx + dy * dy > R2) continue;
      const before = e.hp;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (e.type === 'boss' ? BOSS_HEAL_PCT : HEAL_PCT));
      healed += e.hp - before;
      any = true;
      this.fx('plus', e.x, e.y - e.r, { tint: 0x7dff8e, vy: -45, life: 0.65, s0: 1.1, s1: 0.6 });
    }
    if (any) {
      Sfx.heal();
      if (healed >= 1) this.spawnNumber(h.x, h.y - h.r - 26, healed, 0x7dff8e, 1, '+');
    }
  }

  // ---------------------------------------------------------------- towers
  // Targets the enemy with the least path remaining (works across merging lanes).
  findTarget(x, y, R2, min2) {
    let best = null, br = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= R2 && d2 >= min2 && e.rem < br) { br = e.rem; best = e; }
    }
    return best;
  }

  turnToward(t, ang, rate, dt) {
    const diff = Phaser.Math.Angle.Wrap(ang - t.angle);
    const step = rate * dt;
    t.angle += clamp(diff, -step, step);
    return Math.abs(diff);
  }

  updateTowers(dt) {
    for (const t of this.towers) {
      t.cd -= dt;
      if (t.flashT > 0) { t.flashT -= dt; if (t.flashT <= 0) t.base.clearTint(); }
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 7);
      if (t.pulse > 0) t.pulse = Math.max(0, t.pulse - dt * 2.5);
      const st = t.stats, R = st.range * T, R2 = R * R;
      if (t.type === 'blaster') {
        const tg = this.findTarget(t.x, t.y, R2, 0);
        if (tg) {
          const diff = this.turnToward(t, Math.atan2(tg.y - t.y, tg.x - t.x), 14, dt);
          if (t.cd <= 0 && diff < 0.4) { this.fireBolt(t, tg); t.cd = t.cd < -st.cd ? st.cd : t.cd + st.cd; }
        }
      } else if (t.type === 'mortar') {
        const mr = st.minRange * T;
        const tg = this.findTarget(t.x, t.y, R2, mr * mr);
        if (tg) {
          const diff = this.turnToward(t, Math.atan2(tg.y - t.y, tg.x - t.x), 6, dt);
          if (t.cd <= 0 && diff < 0.5) { this.fireShell(t, tg); t.cd = t.cd < -st.cd ? st.cd : t.cd + st.cd; }
        }
      } else if (t.cd <= 0) {
        let n = 0;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dx = e.x - t.x, dy = e.y - t.y;
          if (dx * dx + dy * dy <= R2) n++;
        }
        if (n > 0) { this.frostPulse(t, R2, R); t.cd = st.cd; }
      }
      if (t.cd < 0) t.cd = 0;
      const v = t.pop.v, ls = v * LEVEL_SCALE[t.level - 1];
      t.base.setScale(ls * (1 + t.pulse * 0.18));
      t.pips.setScale(v);
      if (t.turret) {
        const rc = t.recoil * 4;
        t.turret.setPosition(t.x - Math.cos(t.angle) * rc, t.y - Math.sin(t.angle) * rc).setRotation(t.angle).setScale(ls);
      }
      if (t.level >= 2 || t.type === 'frost') {
        const ga = (t.level === 3 ? 0.4 : t.level === 2 ? 0.2 : 0.12) + 0.1 * Math.sin(this.simT * 3 + t.c) + t.pulse * 0.3;
        t.glow.setAlpha(ga).setScale(v * (0.7 + 0.1 * t.level));
      }
    }
  }

  fireBolt(t, tg) {
    const L = t.level, offs = [[0], [-5, 5], [-8, 0, 8]][L - 1];
    t.barrel = (t.barrel + 1) % offs.length;
    const off = offs[t.barrel], len = 20 + 2 * L, ca = Math.cos(t.angle), sa = Math.sin(t.angle);
    const mx = t.x + ca * len - sa * off, my = t.y + sa * len + ca * off;
    t.recoil = 1;
    const img = this.getImg(this.projPool, 'bolt');
    if (!img) { this.dealDamage(tg, t.stats.dmg, 0xffffff); return; }
    img.setPosition(mx, my).setRotation(t.angle).setBlendMode(ADD).setTint(L === 3 ? 0xbff6ff : 0x4ee6ff);
    this.bolts.push({ img, x: mx, y: my, tg, tx: tg.x, ty: tg.y, dmg: t.stats.dmg, life: 1.2 });
    if (this.parts.length < 260) this.fx('glow', mx, my, { tint: 0x4ee6ff, add: true, s0: 0.25, s1: 0.1, life: 0.08, a: 1 });
    Sfx.shot();
  }

  fireShell(t, tg) {
    const dur = 0.9;
    const pred = Math.min(tg.lane.len, tg.dist + tg.speed * T * (1 - tg.slowAmt) * dur);
    const P = pathAt(tg.lane, pred, {});
    const tx = P.x + P.px * tg.off, ty = P.y + P.py * tg.off;
    const len = 20 + 2 * t.level, sx = t.x + Math.cos(t.angle) * len, sy = t.y + Math.sin(t.angle) * len;
    t.recoil = 1.5;
    const img = this.getImg(this.projPool, 'shell'), sh = this.getImg(this.projPool, 'shadow');
    if (!img || !sh) { if (img) this.relImg(this.projPool, img); if (sh) this.relImg(this.projPool, sh); this.explode(tx, ty, t.stats.dmg, t.stats.splash); return; }
    sh.setDepth(D.shadow).setAlpha(0.3).setScale(0.3);
    img.setPosition(sx, sy);
    this.shells.push({ img, sh, sx, sy, tx, ty, t: 0, dur, dmg: t.stats.dmg, splash: t.stats.splash, peak: 70 + Math.hypot(tx - sx, ty - sy) * 0.25 });
    if (this.parts.length < 260) {
      this.fx('glow', sx, sy, { tint: 0xff9a3c, add: true, s0: 0.35, s1: 0.15, life: 0.12, a: 1 });
      for (let i = 0; i < 3; i++) this.fx('px', sx, sy, { vx: rand(-30, 30), vy: rand(-50, -20), life: 0.5, s0: 1.4, s1: 2.2, tint: 0x8a8f9c, a: 0.5 });
    }
    Sfx.mortar();
  }

  frostPulse(t, R2, R) {
    const st = t.stats;
    let total = 0, sx = 0, sy = 0, n = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy > R2) continue;
      sx += e.x; sy += e.y - e.r; n++;
      this.applySlow(e, st.slow, st.slowDur);
      total += this.dealDamage(e, st.dmg, 0xaee3ff, true);
    }
    if (total > 0 && n > 0) this.spawnNumber(sx / n, sy / n - 26, total, 0xaee3ff, 1.1);
    this.fx('ring', t.x, t.y, { tint: 0xaee3ff, s0: 0.2, s1: R / 63, life: 0.45, a: 0.6, depth: D.ground });
    this.fx('glow', t.x, t.y, { tint: 0xaee3ff, add: true, s0: 0.6, s1: 1.2, life: 0.3, a: 0.5, depth: D.ground });
    t.pulse = 1;
    Sfx.frost();
  }

  explode(x, y, dmg, splash) {
    const R = splash * T;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr = R + e.r * 0.5;
      if (dx * dx + dy * dy <= rr * rr) this.dealDamage(e, dmg, 0xffb060);
    }
    this.fx('ring', x, y, { tint: 0xff9a3c, s0: 0.15, s1: R / 63, life: 0.35, a: 0.9 });
    this.fx('glow', x, y, { tint: 0xffb060, add: true, s0: R / 45, s1: R / 90, life: 0.2, a: 0.9 });
    const n = this.parts.length < 220 ? 10 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(60, 200);
      this.fx('sq', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 420, drag: 1.5, life: rand(0.35, 0.6), s0: rand(0.7, 1.3), s1: 0.3, tint: i % 3 ? 0x8a6a44 : 0xff9a3c, vr: rand(-10, 10) });
    }
    this.cameras.main.shake(70, 0.0018);
    Sfx.explode();
  }

  updateBolts(dt) {
    const sp = 900, arr = this.bolts;
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      b.life -= dt;
      if (b.tg && !b.tg.dead) { b.tx = b.tg.x; b.ty = b.tg.y; } else b.tg = null;
      const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), step = sp * dt;
      if (d <= step + 4 || b.life <= 0) {
        if (b.tg) {
          const tg = b.tg;
          this.dealDamage(tg, b.dmg, 0xffffff);
          if (this.parts.length < 240) for (let k = 0; k < 2; k++) this.fx('px', b.tx, b.ty, { vx: rand(-90, 90), vy: rand(-90, 90), drag: 4, life: 0.2, s0: 0.7, s1: 0.1, tint: 0x4ee6ff, add: true });
        }
        this.relImg(this.projPool, b.img);
        continue;
      }
      b.x += dx / d * step; b.y += dy / d * step;
      b.img.setPosition(b.x, b.y).setRotation(Math.atan2(dy, dx));
      arr[j++] = b;
    }
    arr.length = j;
  }

  updateShells(dt) {
    const arr = this.shells;
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      s.t += dt / s.dur;
      const k = Math.min(1, s.t), sn = Math.sin(Math.PI * k);
      const gx = s.sx + (s.tx - s.sx) * k, gy = s.sy + (s.ty - s.sy) * k;
      s.img.setPosition(gx, gy - sn * s.peak).setScale(1 + 0.6 * sn);
      s.sh.setPosition(gx, gy + 4).setScale(0.3 + 0.25 * (1 - sn), 0.35 + 0.25 * (1 - sn)).setAlpha(0.15 + 0.25 * (1 - sn));
      if (s.t >= 1) {
        this.relImg(this.projPool, s.img); this.relImg(this.projPool, s.sh);
        this.explode(s.tx, s.ty, s.dmg, s.splash);
        continue;
      }
      arr[j++] = s;
    }
    arr.length = j;
  }

  // ---------------------------------------------------------------- fx
  fx(tex, x, y, o = {}) {
    if (this.parts.length >= MAX_PARTS) return null;
    const img = this.getImg(this.partPool, tex);
    if (!img) return null;
    if (o.tint !== undefined) img.setTint(o.tint);
    if (o.add) img.setBlendMode(ADD);
    if (o.depth !== undefined) img.setDepth(o.depth);
    const s0 = o.s0 ?? 1;
    const p = { img, x, y, sx: x, sy: y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0, life: o.life || 0.5, s0, s1: o.s1 ?? s0, a0: o.a ?? 1, vr: o.vr || 0, home: o.home || null };
    p.max = p.life;
    img.setPosition(x, y).setScale(s0).setAlpha(p.a0);
    this.parts.push(p);
    return p;
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.65);
      if (!this.fx(Math.random() < 0.5 ? 'px' : 'sq', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rand(0.35, 0.7), s0: rand(0.8, 1.6), s1: 0.1, tint: color, vr: rand(-8, 8) })) break;
    }
  }

  updateParts(dt) {
    const arr = this.parts;
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.home) { this.coinPop = 0.14; Sfx.coin(); }
        this.relImg(this.partPool, p.img);
        continue;
      }
      const k = 1 - p.life / p.max;
      if (p.home) {
        const e = k * k;
        p.x = p.sx + (p.home.x - p.sx) * e;
        p.y = p.sy + (p.home.y - p.sy) * e - Math.sin(k * Math.PI) * 70;
      } else {
        if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.img.setPosition(p.x, p.y).setScale(p.s0 + (p.s1 - p.s0) * k).setAlpha(p.home ? 1 : p.a0 * (1 - k));
      if (p.vr) p.img.rotation += p.vr * dt;
      arr[j++] = p;
    }
    arr.length = j;
  }

  spawnNumber(x, y, val, tint, scale = 1, prefix = '') {
    const s = prefix + String(Math.max(1, Math.round(val)));
    if (this.nums.length >= MAX_NUMS) this.freeNum(this.nums.shift());
    const imgs = [];
    for (const ch of s) {
      let im = this.getImg(this.digitPool, 'digits', ch);
      if (!im && this.nums.length) { this.freeNum(this.nums.shift()); im = this.getImg(this.digitPool, 'digits', ch); }
      if (!im) break;
      im.setTint(tint ?? 0xffffff);
      imgs.push(im);
    }
    if (!imgs.length) return;
    const n = { imgs, x: x + rand(-12, 12), y: y + rand(-4, 2), vy: -75, life: 0.75, max: 0.75, sc: scale };
    this.nums.push(n);
    this.layoutNum(n, scale * 1.5, 1);
  }
  freeNum(n) { for (const im of n.imgs) this.relImg(this.digitPool, im); }
  layoutNum(n, scale, alpha) {
    const adv = 14 * scale, x0 = n.x - (n.imgs.length - 1) * adv / 2;
    for (let i = 0; i < n.imgs.length; i++) n.imgs[i].setPosition(x0 + i * adv, n.y).setScale(scale).setAlpha(alpha);
  }
  updateNums(dt) {
    const arr = this.nums;
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      n.life -= dt;
      if (n.life <= 0) { this.freeNum(n); continue; }
      n.y += n.vy * dt; n.vy *= Math.max(0, 1 - 3 * dt);
      const k = 1 - n.life / n.max;
      const sc = n.sc * (k < 0.15 ? 1.5 - (k / 0.15) * 0.5 : 1);
      const a = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
      this.layoutNum(n, sc, a);
      arr[j++] = n;
    }
    arr.length = j;
  }

  updateFloats(dt) {
    for (const f of this.floats) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.t.setVisible(false); continue; }
      const k = 1 - f.life / f.max;
      f.y -= 36 * dt;
      f.t.setPosition(f.x, f.y).setAlpha(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1).setScale(k < 0.1 ? 1.3 - k * 3 : 1);
    }
  }

  // ---------------------------------------------------------------- per-frame drawing
  drawCursor(dt) {
    const g = this.cursorG;
    g.clear();
    if (this.state !== 'playing' || this.levelDone) {
      this.ghostBase.setVisible(false); this.ghostTurret.setVisible(false);
      if (this.rangeKey !== '') { this.rangeKey = ''; this.rangeG.clear(); }
      return;
    }
    const tx = this.cx * T + T / 2, ty = TOP + this.cy * T + T / 2;
    const k = Math.min(1, dt * 30);
    this.cpx += (tx - this.cpx) * k; this.cpy += (ty - this.cpy) * k;
    if (Math.abs(tx - this.cpx) < 0.5) this.cpx = tx;
    if (Math.abs(ty - this.cpy) < 0.5) this.cpy = ty;
    let x = this.cpx;
    const y = this.cpy;
    if (this.cursorShake > 0) { this.cursorShake -= dt; x += Math.sin(this.cursorShake * 70) * 6 * Math.max(0, this.cursorShake / 0.25); }
    const tower = this.towerGrid[this.cy][this.cx];
    const onPath = this.map.grid[this.cy][this.cx];
    let color, range, minR = 0, afford = true;
    if (tower) { color = 0xffd84a; range = tower.stats.range; minR = tower.stats.minRange; }
    else {
      const d = TOWERS[this.selType];
      afford = this.gold >= d.cost;
      color = (!onPath && afford) ? 0x7dff8e : 0xff5a5a;
      range = d.range; minR = d.minRange || 0;
    }
    const rk = `${Math.round(x)},${Math.round(y)},${range},${minR},${color}`;
    if (rk !== this.rangeKey) {
      this.rangeKey = rk;
      const rg = this.rangeG;
      rg.clear();
      this.clipCircle(rg, x, y, range * T, color, 0.06, 0.5, 2);
      if (minR) this.clipCircle(rg, x, y, minR * T, color, 0, 0.35, 1.5);
    }
    g.fillStyle(color, 0.14); g.fillRect(x - T / 2 + 3, y - T / 2 + 3, T - 6, T - 6);
    const pulse = (Math.sin(this.animT * 6) + 1) * 0.5;
    const s = T / 2 - 5 + pulse * 3, L = 13;
    g.lineStyle(3.5, color, 1);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + sx * s, y + sy * (s - L)); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * (s - L), y + sy * s);
      g.strokePath();
    }
    if (!tower && !onPath) {
      const key = this.selType;
      if (this.ghostKey !== key) {
        this.ghostKey = key;
        this.ghostBase.setTexture(`${key}_b1`);
        if (key !== 'frost') this.ghostTurret.setTexture(`${key}_t1`);
      }
      const tint = afford ? 0xffffff : 0xff6060;
      this.ghostBase.setVisible(true).setPosition(x, y).setTint(tint);
      if (key !== 'frost') this.ghostTurret.setVisible(true).setPosition(x, y).setTint(tint).setRotation(-Math.PI / 2);
      else this.ghostTurret.setVisible(false);
    } else { this.ghostBase.setVisible(false); this.ghostTurret.setVisible(false); }
  }

  clipCircle(g, x, y, r, color, fillA, strokeA, lw) {
    const N = 56;
    if (!this._cp) { this._cp = []; for (let i = 0; i < N; i++) this._cp.push({ x: 0, y: 0, inside: true }); }
    const cp = this._cp;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, p = cp[i];
      p.inside = py >= TOP && py <= PANEL_Y;
      p.x = px; p.y = clamp(py, TOP, PANEL_Y);
    }
    if (fillA > 0) { g.fillStyle(color, fillA); g.fillPoints(cp, true); }
    g.lineStyle(lw, color, strokeA);
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const a = cp[i % N];
      if (!a.inside) { pen = false; continue; }
      if (pen) g.lineTo(a.x, a.y); else { g.moveTo(a.x, a.y); pen = true; }
    }
    g.strokePath();
  }

  drawHpBars() {
    const g = this.hpG;
    g.clear();
    g.lineStyle(2, 0xaee3ff, 0.85);
    for (const e of this.enemies) {
      if (!e.dead && e.slowAmt > 0) g.strokeCircle(e.x, e.y, e.r + 3);
    }
    for (const e of this.enemies) {
      if (e.dead || e.type === 'boss' || e.hp >= e.maxHp) continue;
      const r = Math.max(0, e.hp / e.maxHp), w = Math.max(18, e.r * 2), bx = e.x - w / 2, by = e.y - e.r - 9;
      g.fillStyle(0x0d1118, 0.85); g.fillRect(bx - 1, by - 1, w + 2, 5);
      g.fillStyle(r > 0.6 ? 0x7fdc6a : r > 0.3 ? 0xffd84a : 0xff5a5a, 1); g.fillRect(bx, by, w * r, 3);
    }
  }

  setTextIfChanged(obj, key, s) {
    if (this['_last_' + key] === s) return;
    this['_last_' + key] = s;
    obj.setText(s);
  }

  updateHUD(dt) {
    this.setTextIfChanged(this.goldText, 'gold', String(this.gold));
    this.setTextIfChanged(this.livesText, 'lives', String(this.lives));
    this.setTextIfChanged(this.waveText, 'wave', `WAVE ${Math.max(1, this.wave)}/10`);
    this.setTextIfChanged(this.scoreText, 'score', `SCORE ${this.score}`);
    let status = '';
    if (this.state !== 'menu') {
      if (this.levelDone) status = 'LEVEL COMPLETE!';
      else if (this.spawning) status = `Wave ${this.wave} incoming!`;
      else if (this.countdownActive) {
        const secs = Math.max(0, this.countdown);
        status = this.wave === 0
          ? `Wave 1 in ${Math.ceil(secs)}s  ·  Space: start now`
          : `Wave ${this.wave + 1} in ${Math.ceil(secs)}s  ·  Space: +${Math.floor(secs) * EARLY_GOLD_PER_SEC}g, foes +${Math.round(RUSH_HP * rushHeat(secs) * 100)}% HP`;
      } else if (this.wave >= TOTAL_WAVES) status = 'FINAL WAVE: hold the line!';
    }
    this.setTextIfChanged(this.statusText, 'status', status);
    if (this.coinPop > 0) { this.coinPop = Math.max(0, this.coinPop - dt); this.hudCoin.setScale(1 + this.coinPop * 3); }

    for (const cd of this.cards) {
      const af = this.gold >= TOWERS[cd.type].cost;
      if (af !== cd.afford) { cd.afford = af; cd.parts.forEach(p => p.setAlpha(af ? 1 : 0.4)); }
    }
    if (this.selShown !== this.selType) {
      this.selShown = this.selType;
      for (const cd of this.cards) {
        if (cd.type === this.selType) cd.bg.setStrokeStyle(3, TOWERS[cd.type].color, 1).setFillStyle(0x263247);
        else cd.bg.setStrokeStyle(2, 0x34425a, 1).setFillStyle(0x1f2838);
      }
    }
    this.setTextIfChanged(this.infoText, 'info', this.infoString());

    const final = this.wave >= TOTAL_WAVES;
    const nextW = final ? TOTAL_WAVES : this.wave + 1;
    const key = nextW + (final ? 'f' : '');
    if (key !== this.previewKey) { this.previewKey = key; this.buildPreview(nextW, final); }

    if (this.boss && !this.boss.dead) {
      const r = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.bossFill.setScale(r, 1);
      this.bossTrailV += (r - this.bossTrailV) * Math.min(1, dt * 3);
      if (this.bossTrailV < r) this.bossTrailV = r;
      this.bossTrail.setScale(this.bossTrailV, 1);
    }
  }

  infoString() {
    const t = this.towerGrid[this.cy][this.cx];
    if (t) {
      const d = TOWERS[t.type], s = t.stats;
      let l2;
      if (t.type === 'frost') l2 = `DMG ${fmt(s.dmg)} · SLOW ${Math.round(s.slow * 100)}% · RNG ${s.range.toFixed(1)}`;
      else if (t.type === 'mortar') l2 = `DMG ${fmt(s.dmg)} · SPL ${s.splash.toFixed(2)} · RNG ${s.range.toFixed(1)}`;
      else l2 = `DMG ${fmt(s.dmg)} · ${(1 / s.cd).toFixed(1)}/s · RNG ${s.range.toFixed(1)}`;
      const up = t.level < 3 ? `U: upgrade ${upgradeCost(t.type, t.level)}g` : 'MAX LEVEL';
      return `${d.name}  Lv ${t.level}\n${l2}\n${up}  ·  S: sell +${Math.floor(t.spent * 0.6)}g`;
    }
    if (this.map.grid[this.cy][this.cx]) return "Path tile\nEnemies walk here, you\ncan't build on it.";
    return `Empty tile\n1/2/3 build · click: ${TOWERS[this.selType].name}\nU / S work on towers`;
  }

  publish() {
    const F = window.__FORGE__;
    F.state = this.state;
    F.score = this.score;
    F.lives = this.lives;
    F.level = this.mapIdx;
    F.wave = Math.max(1, this.wave);
    F.gold = this.gold;
    F.mapName = this.map.name;
    F.levelComplete = !!this.levelDone;
  }

  // ---------------------------------------------------------------- scripted self-test
  clearBoard() {
    for (const e of this.enemies) { if (!e.dead) { e.spr.destroy(); e.shadow.destroy(); e.dead = true; } }
    for (const t of this.towers) [t.base, t.turret, t.glow, t.shadow, t.pips].forEach(o => o && o.destroy());
    for (const b of this.bolts) this.relImg(this.projPool, b.img);
    for (const s of this.shells) { this.relImg(this.projPool, s.img); this.relImg(this.projPool, s.sh); }
    this.enemies = []; this.towers = []; this.bolts = []; this.shells = [];
    this.towerGrid = [];
    for (let r = 0; r < ROWS; r++) this.towerGrid.push(new Array(COLS).fill(null));
    this.boss = null; this.bossParts.forEach(p => p.setVisible(false));
  }

  // Run via ?selftest or window.__FORGE__.selfTest(). Plays level 1 with fixed
  // 1/30s steps, validates every map, and writes window.__FORGE__.selfTestReport.
  runSelfTest() {
    Sfx.setMuted(true);
    const checks = [];
    const chk = (name, pass, info = '') => checks.push({ name, pass: !!pass, info: String(info) });
    const dt = 1 / 30;
    const step = (secs, until) => {
      for (let t = 0; t < secs; t += dt) {
        if (this.state !== 'playing' || this.levelDone) return;
        this.sim(dt); this.updateParts(dt); this.updateNums(dt);
        if (until && until()) return;
      }
    };
    const at = (c, r) => { this.cx = c; this.cy = r; };
    try {
      this.startGame();
      chk('start: playing, gold 150, lives 20, map 1, wave 1', this.state === 'playing' && this.gold === 150 && this.lives === 20 && this.mapIdx === 1 && Math.max(1, this.wave) === 1);
      at(0, 2); this.tryPlace('blaster');
      chk('path tile rejects a build', !this.towerGrid[2][0] && this.gold === 150);
      at(4, 3); this.tryPlace('blaster');
      chk('Blaster placed for 50g', !!this.towerGrid[3][4] && this.gold === 100, `gold=${this.gold}`);
      this.gold += 200;
      const tw = this.towerGrid[3][4];
      let g0 = this.gold; this.tryUpgrade();
      chk('upgrade to L2 (38g, bigger art)', tw.level === 2 && this.gold === g0 - 38 && tw.base.texture.key === 'blaster_b2' && tw.turret.texture.key === 'blaster_t2');
      g0 = this.gold; this.tryUpgrade();
      chk('upgrade to L3 (63g, triple barrel art, 3 pips)', tw.level === 3 && this.gold === g0 - 63 && tw.base.texture.key === 'blaster_b3' && tw.turret.texture.key === 'blaster_t3' && tw.pips.texture.key === 'pips3');
      g0 = this.gold; this.tryUpgrade();
      chk('third upgrade does nothing', tw.level === 3 && this.gold === g0);
      g0 = this.gold; const spent = tw.spent; this.trySell();
      chk('sell refunds 60% of spent', !this.towerGrid[3][4] && this.gold === g0 + Math.floor(spent * 0.6), `spent ${spent}, refund ${this.gold - g0}`);
      g0 = this.gold; this.startNextWave(true);
      chk('Space before wave 1 starts it, no bonus', this.wave === 1 && this.spawning && this.gold === g0);
      g0 = this.gold; this.startNextWave(true);
      chk('Space while spawning does nothing', this.wave === 1 && this.gold === g0);
      step(90, () => this.lives < 20);
      chk('leak reduces lives', this.lives < 20 && this.leaks > 0, `lives=${this.lives}`);

      this.gold += 6000;
      const plan = this.map.plan;
      for (const [c, r, type] of plan) { at(c, r); this.tryPlace(type); this.tryUpgrade(); this.tryUpgrade(); }
      chk('defense built and fully upgraded', this.towers.length === plan.length && this.towers.every(t => t.level === 3), `${this.towers.length} towers`);

      let slowSeen = false, bonusChecked = false, guard = 0;
      const watch = () => {
        if (!slowSeen) for (const e of this.enemies) if (!e.dead && e.slowAmt > 0 && e.tm === 1 && e.spr.texture.key === e.tex + '_ice') { slowSeen = true; break; }
        return false;
      };
      while (this.state === 'playing' && !this.levelDone && this.wave < TOTAL_WAVES && guard++ < 30) {
        step(300, () => { watch(); return this.countdownActive; });
        if (this.state !== 'playing' || this.levelDone || !this.countdownActive) break;
        step(9, watch);
        const cdn = this.countdown, g1 = this.gold;
        this.startNextWave(true);
        if (!bonusChecked) {
          bonusChecked = true;
          chk('early send awards whole seconds x1', this.gold === g1 + Math.floor(cdn) * EARLY_GOLD_PER_SEC, `${Math.floor(cdn)}s -> +${this.gold - g1}g`);
          chk('rushed wave gets tougher', this.rushHp[this.wave] > 1, `hp x${(this.rushHp[this.wave] || 1).toFixed(2)}`);
        }
      }
      step(900, watch);
      chk('Frost slows and tints enemies', slowSeen);
      chk('kills raise the score', this.kills > 0 && this.score > 0, `kills=${this.kills} score=${this.score}`);
      chk('wave reached 10', Math.max(1, this.wave) === 10, `wave=${this.wave}`);
      chk('boss spawned with HP bar and shake', this._bossSpawned && this._bossBarShown && this._bossShake);
      chk("level 1 complete screen, state stays 'playing'", this.state === 'playing' && this.levelDone && this.levelO.visible, `state=${this.state} lives=${this.lives}`);
      this.publish();
      chk('__FORGE__ reports level 1, wave 10', window.__FORGE__.level === 1 && window.__FORGE__.wave === 10);

      // ---- every map: load, geometry, build rules
      this.levelO.setVisible(false);
      this.clearBoard();
      MAPS.forEach((m, i) => {
        let genOk = true;
        try { this.genBoard(m); genOk = this.textures.exists(`board_${m.id}`); } catch (err) { genOk = false; }
        const err = validateMap(m);
        chk(`map ${i + 1} ${m.name}: loads, every spawn connects to the exit`, genOk && !err, err || `${m.lanes.length} lane(s), len ${Math.round(m.lanes[0].len / T)} tiles`);
        const bad = m.plan.filter(([c, r]) => c < 0 || c >= COLS || r < 0 || r >= ROWS || m.grid[r][c]);
        const uniq = new Set(m.plan.map(p => p[0] + ',' + p[1])).size === m.plan.length;
        chk(`map ${i + 1}: no tower slot on a path tile`, !bad.length && uniq, bad.map(p => p.join(',')).join(' '));
        this.map = m;
        this.towerGrid = [];
        for (let r = 0; r < ROWS; r++) this.towerGrid.push(new Array(COLS).fill(null));
        this.gold = 99999;
        const before = this.towers.length;
        let pathTiles = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (m.grid[r][c]) { pathTiles++; at(c, r); this.tryPlace('blaster'); }
        chk(`map ${i + 1}: building on its ${pathTiles} path tiles is rejected`, this.towers.length === before && pathTiles > 0);
        this.clearBoard();
      });
      chk('only Crossroads crosses itself, drawn as a bridge', MAPS[2].crossings.length === 1 && !!MAPS[2].bridge && MAPS.filter(m => m.crossings.length).length === 1);
      chk('Twin Gates has two spawns merging into one exit', MAPS[3].lanes.length === 2 && MAPS[3].lanes[0].spawn.y !== MAPS[3].lanes[1].spawn.y);

      // ---- difficulty climbs map to map
      let climb = true;
      for (let i = 1; i < MAPS.length; i++) {
        if (!(waveHp(MAPS[i], 1) > waveHp(MAPS[i - 1], 1) && waveCount(MAPS[i], 1) > waveCount(MAPS[i - 1], 1))) climb = false;
        if (!(MAPS[i].bossMult > MAPS[i - 1].bossMult)) climb = false;
      }
      chk('each map starts stronger and has a tougher boss', climb, MAPS.map(m => Math.round(waveHp(m, 1))).join(' < '));

      // ---- Twin Gates: a wave splits between both gates
      this.map = MAPS[3]; this.mapIdx = 4;
      this.state = 'playing'; this.levelDone = false; this.lives = 20; this.gold = 99999;
      this.wave = 0; this.spawning = false; this.countdownActive = true; this.countdown = FIRST_COUNTDOWN;
      this.waveAlive = []; this.waveSpawnDone = []; this.waveCleared = []; this.rushHp = [];
      for (const [c, r, type] of this.map.plan) { at(c, r); this.tryPlace(type); this.tryUpgrade(); this.tryUpgrade(); }
      const lanesSeen = new Set();
      this.startNextWave(false);
      step(14, () => { for (const e of this.enemies) lanesSeen.add(e.laneIdx); return false; });
      chk('Twin Gates: wave 1 comes from both gates', lanesSeen.size === 2, `lanes seen: ${[...lanesSeen].join(',')}`);
      this.clearBoard();
    } catch (err) {
      chk('no exceptions', false, err && err.message);
    }
    Sfx.setMuted(false);
    const passed = checks.filter(c => c.pass).length;
    window.__FORGE__.selfTestReport = { passed, total: checks.length, checks, score: this.score, lives: this.lives, kills: this.kills, leaks: this.leaks };
  }

  // ---------------------------------------------------------------- main loop
  sim(dt) {
    this.simT += dt;
    if (this.bossShakeT > 0) this.bossShakeT -= dt;
    if (this.spawning) {
      this.spawnClock += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.spawnClock) {
        const s = this.spawnQueue.shift();
        this.spawnEnemy(s.type, this.wave, s.lane);
      }
      if (!this.spawnQueue.length) {
        this.spawning = false;
        this.waveSpawnDone[this.wave] = true;
        if (this.wave < TOTAL_WAVES) { this.countdown = WAVE_COUNTDOWN; this.countdownActive = true; }
        this.checkWaveClear(this.wave);
      }
    } else if (this.countdownActive) {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.countdown = 0; this.startNextWave(false); }
    }
    this.updateEnemies(dt);
    if (this.state !== 'playing') return;
    this.updateTowers(dt);
    this.updateBolts(dt);
    this.updateShells(dt);
    const arr = this.enemies;
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
    arr.length = j;
    if (this.wave >= TOTAL_WAVES && this.waveSpawnDone[TOTAL_WAVES] && !this.spawning && arr.length === 0 && this.lives > 0) this.finishLevel();
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    if (this.state === 'playing' && !this.levelDone) {
      this.handleRepeat(dt);
      this.sim(dt);
    }
    if (this.state !== 'paused') {
      this.animT += dt;
      this.updateParts(dt);
      this.updateNums(dt);
      this.updateFloats(dt);
      this.drawCursor(dt);
      this.drawHpBars();
    }
    this.updateHUD(dt);
    this.publish();
  }
}

// ============================================================================
// Boot
// ============================================================================
(function prepPage() {
  const s = document.createElement('style');
  s.textContent = 'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0f141d;}#game{width:100vw;height:100vh;}';
  document.head.appendChild(s);
})();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#1b2230',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene: [Main],
});
