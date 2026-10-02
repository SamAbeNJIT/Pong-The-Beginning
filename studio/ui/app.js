// Forge Studio UI. Talks to the app only through window.forge (see preload.cjs).
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

const state = {
  view: "new",
  profiles: [],
  profile: "standard",
  engine: "auto",
  games: [],
  selected: null,
  job: null,
  key: "missing",
  browser: true,
  thumbs: new Map(), // screenshot path -> data URL
};

const STEP = { design: 0, build: 1, change: 1, playtest: 2, review: 3, repair: 4 };
const KEYS = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Space", Enter: "Return", Escape: "Esc", ShiftLeft: "Shift", ShiftRight: "Shift" };
const keyLabel = (k) => KEYS[k] ?? k.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
const money = (n) => (n == null ? "—" : `$${n.toFixed(2)}`);
const plain = (err) => String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 5000);
}

async function image(file) {
  if (!file) return null;
  if (!state.thumbs.has(file)) state.thumbs.set(file, await window.forge.image(file).catch(() => null));
  return state.thumbs.get(file);
}

// ---------------------------------------------------------------- navigation
function show(view, slug) {
  state.view = view;
  if (slug !== undefined) state.selected = slug;
  for (const v of ["new", "job", "game", "settings"]) $(`view-${v}`).hidden = v !== view;
  $("nav-new").classList.toggle("active", view === "new");
  $("nav-settings").classList.toggle("active", view === "settings");
  const game = state.games.find((g) => g.slug === state.selected);
  $("view-title").textContent =
    view === "new" ? "New game" : view === "settings" ? "Settings" : view === "job" ? (state.job?.kind === "change" ? "Changing a game" : "Building") : (game?.title ?? "");
  renderLibrary();
  if (view === "game") renderGame();
  if (view === "settings") renderSettings();
  if (view === "new") renderComposer();
  $("scroll").scrollTop = 0;
}

// ---------------------------------------------------------------- library
const STATUS = { shipped: "Ready", unfinished: "Unfinished", handmade: "Hand-built", incomplete: "Not finished", building: "Building" };
function statusOf(g) {
  const j = state.job;
  const building = j?.status === "running" && (j.slug ?? j.events.find((e) => e.type === "design")?.slug) === g.slug;
  return building ? "building" : g.status;
}
async function loadGames() {
  state.games = await window.forge.listGames();
  renderLibrary();
}

function renderLibrary() {
  const nav = $("library");
  nav.replaceChildren();
  if (!state.games.length) nav.append(el("p", { className: "lib-sub", textContent: "Games you make show up here." }));
  for (const g of state.games) {
    const thumb = el("span", { className: "lib-thumb" });
    image(g.screenshot).then((src) => src && (thumb.style.backgroundImage = `url("${src}")`));
    const status = statusOf(g);
    const item = el(
      "button",
      { className: `lib-item${state.view === "game" && state.selected === g.slug ? " active" : ""}`, type: "button" },
      thumb,
      el("span", { className: "lib-text" }, el("div", { className: "lib-title", textContent: g.title }), el("div", { className: "lib-sub" }, el("span", { className: `dot ${status === "building" ? "live" : status}` }), STATUS[status])),
    );
    item.onclick = () => show("game", g.slug);
    nav.append(item);
  }
  const pill = $("nav-job");
  const j = state.job;
  pill.hidden = !j;
  if (j) {
    const title = j.events.find((e) => e.type === "design")?.title ?? j.title ?? "New game";
    const label = j.status === "running" ? `${stageName(j)} · ${money(cost(j))}` : { shipped: "Ready to play", unfinished: "Finished, not signed off", failed: "Failed", cancelled: "Cancelled", done: "Done" }[j.status];
    pill.replaceChildren(el("span", { className: "t", textContent: title }), el("span", { className: "s" }, el("span", { className: `dot ${j.status === "running" ? "live" : j.status}` }), label));
  }
}

// ---------------------------------------------------------------- composer
function renderComposer() {
  const box = $("profiles");
  box.replaceChildren();
  for (const p of state.profiles) {
    const card = el(
      "button",
      { className: "profile", type: "button", role: "radio" },
      el("span", { className: "name" }, p.name, ...(p.advisor ? [el("span", { className: "badge", textContent: "Fable advisor" })] : [])),
      el("span", { className: "blurb", textContent: p.blurb }),
      el("span", { className: "est", textContent: p.estimate }),
    );
    card.setAttribute("aria-checked", String(p.id === state.profile));
    card.onclick = () => {
      state.profile = p.id;
      renderComposer();
    };
    box.append(card);
  }
  for (const b of $("engine").children) b.setAttribute("aria-checked", String(b.dataset.v === state.engine));
  $("notice-key").hidden = state.key !== "missing";
  $("notice-browser").hidden = state.browser;
  const busy = state.job?.status === "running";
  $("build").disabled = busy || state.key === "missing" || !state.browser;
  $("build-hint").textContent = busy ? "A build is running. You can start the next one when it finishes." : "";
}

$("engine").onclick = (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (!v) return;
  state.engine = v;
  renderComposer();
};

$("build").onclick = async () => {
  try {
    const job = await window.forge.build({ vision: $("vision").value, profile: state.profile, engine: state.engine });
    adoptJob(job);
    show("job");
  } catch (err) {
    toast(plain(err));
  }
};

async function installBrowser(btn) {
  btn.disabled = true;
  btn.textContent = "Installing…";
  try {
    await window.forge.installBrowser();
    state.browser = true;
    toast("Test browser installed.");
  } catch (err) {
    toast(plain(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Install it";
    renderComposer();
    if (state.view === "settings") renderSettings();
  }
}
$("install-browser").onclick = (e) => installBrowser(e.currentTarget);
$("browser-install").onclick = (e) => installBrowser(e.currentTarget);
document.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => show(b.dataset.goto)));

// ---------------------------------------------------------------- job
const cost = (j) => [...j.events].reverse().find((e) => e.type === "call")?.total ?? 0;
const lastStage = (j) => [...j.events].reverse().find((e) => e.type === "stage");
function stageName(j) {
  const s = lastStage(j);
  return { design: "Designing", build: "Writing the game", change: "Applying your change", playtest: "Playtesting", review: "Reviewing", repair: "Fixing" }[s?.stage] ?? "Starting";
}

// What the running step is doing right now, from the harness's progress heartbeat.
function liveText(j) {
  const stage = lastStage(j)?.stage;
  if (stage === "playtest") return "Playtesting in the test browser…";
  const l = j.live;
  const code = ["build", "change", "repair"].includes(stage);
  const retry = l?.attempt > 1 ? ` (attempt ${l.attempt})` : "";
  if (!l || l.phase === "waiting") return `${stageName(j)}… waiting for Claude${retry}`;
  if (l.phase === "advisor") return `Asking the Fable advisor…${retry}`;
  if (l.phase === "thinking") return `${code ? "Planning the code" : stage === "review" ? "Reviewing the screenshots" : "Thinking it through"}…${retry}`;
  if (code) return `Writing ${l.file ?? "code"} · ${l.lines.toLocaleString()} lines so far${retry}`;
  return `${stage === "review" ? "Writing the review" : "Writing the design"}…${retry}`;
}

// Silence is normal for a few seconds; past this, say so. The harness itself retries after 2 minutes.
const QUIET_MS = 45_000;
function liveSub(j) {
  const stage = lastStage(j)?.stage;
  const since = Date.now() - (j.live?.at ?? lastStage(j)?.at ?? j.startedAt);
  if (stage === "playtest" || since < QUIET_MS) return "";
  return `No data from Claude for ${Math.round(since / 1000)}s. If the connection dropped, Forge retries on its own.`;
}

function renderLive() {
  const row = $("feed").querySelector(".live-row");
  if (!row || !state.job) return renderJob();
  row.querySelector(".t").textContent = liveText(state.job);
  row.querySelector(".sub").textContent = liveSub(state.job);
}

function adoptJob(job) {
  state.job = job;
  renderJob();
  renderLibrary();
}

function feedItem(icon, cls, text, sub, issues) {
  const body = el("div", {}, el("div", { textContent: text }));
  if (sub) body.append(el("div", { className: "sub", textContent: sub }));
  if (issues?.length) body.append(el("ul", { className: "issues" }, ...issues.map((i) => el("li", { textContent: i }))));
  return el("li", {}, el("span", { className: `ic ${cls}`, textContent: icon }), body);
}

function describe(e, j) {
  switch (e.type) {
    case "design":
      return feedItem("✎", "ok", `Designed “${e.title}”`, `${e.engine === "three" ? "3D" : "2D"} · ${e.pitch}`);
    case "call":
      if (e.label === "build") return feedItem("⌘", "ok", "Wrote the game", `${(e.output / 1000).toFixed(0)}k tokens · ${money(e.usd)}${e.advisor ? ` · asked the Fable advisor ${e.advisor}×` : ""}`);
      if (e.label === "repair") return feedItem("⌘", "ok", j.kind === "change" && !j.events.some((x) => x.type === "playtest") ? "Made your change" : "Applied fixes", `${money(e.usd)}${e.advisor ? ` · asked the Fable advisor ${e.advisor}×` : ""}`);
      return null;
    case "playtest": {
      const failed = e.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
      return feedItem(e.passed ? "✓" : "✗", e.passed ? "ok" : "bad", `Playtest ${e.round} ${e.passed ? "passed" : "failed"}`, `${e.fps} fps in the test browser`, failed);
    }
    case "review":
      return feedItem(e.verdict === "ship" ? "★" : "↺", e.verdict === "ship" ? "ok" : "warn", e.verdict === "ship" ? "Reviewer signed off" : "Reviewer asked for changes", e.summary.split(/(?<=\.)\s/)[0], e.verdict === "ship" ? [] : e.issues.map((i) => i.description));
    case "retry":
      return feedItem("↻", "warn", `Connection to Claude dropped. Retrying (try ${e.attempt} of ${e.of})`, e.reason);
    case "done":
      return feedItem(e.shipped ? "●" : "◐", e.shipped ? "ok" : "warn", e.shipped ? "Ready to play" : `Stopped after ${e.rounds} rounds`, e.shipped ? "Passed the playtest and the review." : "It's playable, but the reviewer didn't sign off. Try a change or play it as is.");
    default:
      return null;
  }
}

async function renderJob() {
  const j = state.job;
  if (!j) return;
  const design = j.events.find((e) => e.type === "design");
  const game = state.games.find((g) => g.slug === j.slug);
  $("job-kind").textContent = j.kind === "change" ? "Changing a game" : `New game · ${state.profiles.find((p) => p.id === j.profile)?.name ?? ""}`;
  $("job-title").textContent = design?.title ?? game?.title ?? (j.status === "running" ? "Designing your game…" : "New game");
  $("job-pitch").textContent = design?.pitch ?? (j.kind === "change" ? j.request : j.vision);
  $("job-cost").textContent = money(cost(j));

  const done = j.events.find((e) => e.type === "done");
  const at = done ? 5 : STEP[lastStage(j)?.stage] ?? 0;
  for (const li of $("steps").children) {
    const n = Number(li.dataset.step);
    li.className = n < at || (done?.shipped && n === 5) ? "done" : n === at && j.status === "running" ? "now" : "";
  }
  const round = lastStage(j)?.round;
  const rounds = state.profiles.find((p) => p.id === j.profile)?.rounds;
  $("job-round").textContent = j.status === "running" && round ? `Round ${round}${rounds ? ` of up to ${rounds}` : ""}` : "";

  $("feed").replaceChildren(...j.events.map((e) => describe(e, j)).filter(Boolean).reverse());
  if (j.status === "running") {
    const row = feedItem("•", "live", liveText(j), " ");
    row.classList.add("live-row");
    row.querySelector("div > div").className = "t";
    row.querySelector(".sub").textContent = liveSub(j);
    $("feed").prepend(row);
  }
  const error = [...j.events].reverse().find((e) => e.type === "error");
  if (j.status === "cancelled") $("feed").prepend(feedItem("✗", "bad", "Cancelled"));
  if (j.status === "failed") $("feed").prepend(feedItem("✗", "bad", error?.message ?? "The build stopped with an error.", "Nothing is lost: press Try again. The full log below has the details."));

  $("log").textContent = j.log.join("\n");
  const shot = [...j.events].reverse().find((e) => e.type === "playtest");
  const src = await image(shot?.screenshots.at(-1));
  const fig = $("job-shot");
  if (src) fig.replaceChildren(el("img", { src, alt: "Latest playtest screenshot" }), el("figcaption", { textContent: `Playtest ${shot.round}` }));
  else fig.replaceChildren(el("div", { className: "shot-empty", textContent: "The first playtest screenshot shows up here." }));

  const actions = $("job-actions");
  actions.replaceChildren();
  if (j.status === "running") {
    const cancel = el("button", { className: "btn ghost", type: "button", textContent: "Cancel" });
    cancel.onclick = () => window.forge.cancel();
    actions.append(cancel);
  } else {
    const slug = design?.slug ?? j.slug;
    const close = el("button", { className: "btn ghost", type: "button", textContent: "Done" });
    close.onclick = async () => {
      await window.forge.dismiss();
      state.job = null;
      slug && state.games.some((g) => g.slug === slug) ? show("game", slug) : show("new");
    };
    actions.append(close);
    if (["failed", "cancelled"].includes(j.status)) {
      const again = el("button", { className: "btn primary", type: "button", textContent: "Try again" });
      again.onclick = async () => {
        try {
          adoptJob(j.kind === "change" ? await window.forge.change({ slug: j.slug, request: j.request, profile: j.profile }) : await window.forge.build({ vision: j.vision, profile: j.profile, engine: j.engine }));
        } catch (err) {
          toast(plain(err));
        }
      };
      actions.append(again);
    }
    if (slug && ["shipped", "unfinished", "done"].includes(j.status)) {
      const playBtn = el("button", { className: "btn primary", type: "button", textContent: "Play now" });
      playBtn.onclick = () => play(slug);
      actions.append(playBtn);
    }
  }
}

function tick() {
  const j = state.job;
  if (!j) return;
  const end = j.status === "running" ? Date.now() : j.endedAt ?? Date.now();
  const s = Math.max(0, Math.floor((end - j.startedAt) / 1000));
  $("job-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (j.status === "running" && state.view === "job") renderLive();
}
setInterval(tick, 1000);

window.forge.onJob(async (msg) => {
  if (msg.setup) return;
  const j = state.job;
  if (!j || msg.id !== j.id) return;
  if (msg.event?.type === "progress") {
    j.live = { ...msg.event, at: Date.now() };
    if (state.view === "job") renderLive();
    return;
  }
  if (msg.event) {
    j.events.push({ ...msg.event, at: Date.now() });
    if (msg.event.type === "stage" || msg.event.type === "call") j.live = null;
    if (msg.event.type === "design" || msg.event.type === "done") await loadGames();
  }
  if (msg.log) {
    j.log.push(msg.log);
    if (j.log.length > 400) j.log.shift();
  }
  if (msg.end) {
    j.status = msg.end.status;
    j.endedAt = Date.now();
    await loadGames();
  }
  if (state.view === "job") renderJob();
  renderLibrary();
  if (state.view === "new") renderComposer();
});

$("nav-job").onclick = () => show("job");
$("nav-new").onclick = () => show("new");
$("nav-settings").onclick = () => show("settings");

// ---------------------------------------------------------------- game
async function play(slug) {
  try {
    await window.forge.play(slug);
  } catch (err) {
    toast(plain(err));
  }
}

async function renderGame() {
  const g = state.games.find((x) => x.slug === state.selected);
  if (!g) return show("new");
  $("game-title").textContent = g.title;
  $("game-pitch").textContent = g.pitch;
  const chips = [
    [STATUS[statusOf(g)], g.status],
    [g.engine === "three" ? "3D" : "2D", ""],
    ...(g.usd != null ? [[`${money(g.usd)} to make`, ""]] : []),
    ...(g.changes ? [[`${g.changes} change${g.changes > 1 ? "s" : ""}`, ""]] : []),
  ];
  $("game-chips").replaceChildren(...chips.map(([t, c]) => el("span", { className: `chip ${c}`, textContent: t })));
  const controls = $("game-controls");
  controls.replaceChildren();
  const seen = new Set();
  for (const c of g.controls) {
    if (seen.has(c.action)) continue;
    seen.add(c.action);
    const same = g.controls.filter((x) => x.action === c.action).map((x) => x.key);
    controls.append(el("dt", {}, ...same.map((k) => el("kbd", { textContent: keyLabel(k) }))), el("dd", { textContent: c.action }));
  }
  const src = await image(g.screenshot);
  $("game-shot").replaceChildren(src ? el("img", { src, alt: `${g.title} screenshot` }) : el("div", { className: "shot-empty", textContent: "No screenshot yet. Play it, or run a change to playtest it." }));
  const playable = g.status !== "incomplete" && statusOf(g) !== "building";
  $("game-play").disabled = !playable;
  $("game-play").title = playable ? "" : "This game hasn't been built yet. Try the build again, or describe a change.";
  $("game-play").onclick = () => play(g.slug);
  $("game-reveal").onclick = () => window.forge.reveal(g.slug);
  const sel = $("change-profile");
  sel.replaceChildren(...state.profiles.map((p) => el("option", { value: p.id, textContent: `${p.name} harness`, selected: p.id === state.profile })));
  $("change-go").disabled = state.job?.status === "running" || state.key === "missing";
  $("change-go").onclick = async () => {
    try {
      const job = await window.forge.change({ slug: g.slug, request: $("change").value, profile: sel.value });
      $("change").value = "";
      adoptJob(job);
      show("job");
    } catch (err) {
      toast(plain(err));
    }
  };
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const msg = {
    keychain: ["shipped", "Saved, encrypted with your Mac's Keychain."],
    env: ["shipped", "Using ANTHROPIC_API_KEY from the environment."],
    session: ["unfinished", "Saved for this session only. This system can't encrypt it, so it isn't written to disk."],
    missing: ["failed", "No key yet."],
  }[state.key];
  $("key-status").replaceChildren(el("span", { className: `dot ${msg[0]}` }), msg[1]);
  $("key-clear").hidden = !["keychain", "session"].includes(state.key);
  $("games-dir").textContent = state.gamesDir;
  $("browser-status").replaceChildren(el("span", { className: `dot ${state.browser ? "shipped" : "failed"}` }), state.browser ? "Installed. Every build is playtested in it." : "Not installed yet.");
  $("browser-install").hidden = state.browser;
  $("costs").replaceChildren(...state.profiles.map((p) => el("li", {}, el("b", { textContent: p.name }), ` — ${p.estimate}`)));
}

$("key-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    state.key = await window.forge.saveKey($("key-input").value);
    $("key-input").value = "";
    toast("Key saved.");
  } catch (err) {
    toast(plain(err));
  }
  renderSettings();
};
$("key-clear").onclick = async () => {
  state.key = await window.forge.clearKey();
  renderSettings();
};
$("games-dir-change").onclick = async () => {
  state.gamesDir = await window.forge.chooseGamesDir();
  await loadGames();
  renderSettings();
};

// ---------------------------------------------------------------- boot
(async () => {
  const init = await window.forge.init();
  Object.assign(state, {
    profiles: init.profiles,
    browser: init.browser,
    key: init.key,
    gamesDir: init.gamesDir,
    profile: init.last.profile,
    engine: init.last.engine,
  });
  const ideas = $("ideas");
  for (const idea of init.examples) {
    const chip = el("button", { className: "idea", type: "button", textContent: idea, title: idea });
    chip.onclick = () => {
      $("vision").value = idea;
      $("vision").focus();
    };
    ideas.append(chip);
  }
  await loadGames();
  if (init.job) {
    adoptJob(init.job);
    show("job");
  } else show("new");
})();
