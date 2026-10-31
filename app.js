import { openViewer } from "./viewer.js";
import { readBarcode, lookupProduct, forGrams } from "./barcode.js";
import { weightTrend, weeklyChange, cycleInfo, phaseOn, periodMarks, PHASE, addDays, dayNote } from "./body.js";
import { catSVG } from "./cat.js";
import { ACTIVITY, PACES, paceOf, paceOptions, safeMinimum, suggestGoals, KCAL_PER_KG, EXERCISES, EFFORT, exerciseBurn, stepsBurn, learnUsualSteps } from "./goals.js";
import { createStore } from "./store.js";
import { createCat } from "./cat-rig.js";
import { askExercise, askAI, askBarcode, hasKey, loadAISettings, saveAISettings, testProvider, PROVIDERS } from "./ai.js";

const demo = new URLSearchParams(location.search).has("demo");
const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

const SLOTS = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  ["snack", "Snacks"],
];
const SLOT_NAME = Object.fromEntries(SLOTS);

const state = {
  view: "loading", // loading | login | day | meal | settings | goals
  goals: null,
  goalForm: null,
  user: null,
  date: iso(new Date()),
  meals: [],
  meal: null,
  composer: "",
  sending: false,
  error: null, // {text, retry, settings}
  confirmDelete: false,
  sheet: false,
  sheetSlot: "lunch",
  loginError: "",
  settingsStatus: null, // {ok, text}
  showKey: false,
};
let store;
let unsubDay = null;
let unsubGoals = null;

// Live "what is the AI doing" line with a seconds counter.
let aiTicker = null;
function setAIStatus(text) {
  state.aiStatus = text;
  if (!state.aiStart) state.aiStart = Date.now();
  paintAIStatus();
  if (!aiTicker) aiTicker = setInterval(paintAIStatus, 1000);
}
function paintAIStatus() {
  const el = document.getElementById("ai-status");
  if (el && state.aiStatus) el.textContent = `${state.aiStatus} ${Math.round((Date.now() - state.aiStart) / 1000)}s`;
}
function stopAIStatus() {
  clearInterval(aiTicker); aiTicker = null;
  state.aiStatus = ""; state.aiStart = 0;
}

// ---------- little helpers ----------
// The painted Munchkin picture (big for the home and login screens, small for icons).
function catPic(size = "big", label = "Munchkin the cat") {
  const src = size === "big" ? "img/munchkin-480.webp?v=2" : "img/munchkin-160.webp?v=2";
  return `<img class="cat-pic" src="${src}" alt="${label}" draggable="false">`;
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromIso(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftDate(s, days) {
  const d = fromIso(s);
  d.setDate(d.getDate() + days);
  return iso(d);
}
function prettyDate(s) {
  const today = iso(new Date());
  if (s === today) return "Today";
  if (s === shiftDate(today, -1)) return "Yesterday";
  return fromIso(s).toLocaleDateString(undefined, { weekday: "long" });
}
function longDate(s) {
  return fromIso(s).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
// Shows Gemini's answer nicely: **bold** and "* " bullets.
function pretty(text) {
  return esc(text)
    .replace(/^#{1,6}\s+(.+)$/gm, "<strong>$1</strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?]|$)/g, "$1<em>$2</em>")
    .replace(/\n{3,}/g, "\n\n");
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function sumItems(items = []) {
  return items.reduce((t, i) => ({
    calories: t.calories + (i.calories || 0), protein: t.protein + (i.protein || 0),
    carbs: t.carbs + (i.carbs || 0), fat: t.fat + (i.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
function defaultSlot() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 18 && h < 23) return "dinner";
  return "snack";
}
let toastTimer;
function toast(text) {
  $toast.textContent = text;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 2600);
}
function macrosHTML(t) {
  return `<div class="macros">
    <span class="macro"><i class="p"></i>${t.protein}g <span>protein</span></span>
    <span class="macro"><i class="c"></i>${t.carbs}g <span>carbs</span></span>
    <span class="macro"><i class="f"></i>${t.fat}g <span>fat</span></span>
  </div>`;
}
const ICON = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  camera: `<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>`,
  pen: `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
  google: `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`,
};

// ---------- screens ----------
// ---------- the animated cat ----------
const cats = { day: createCat({ width: 92 }), hero: createCat({ width: 170 }) };
const catMood = () => { const h = new Date().getHours(); return h >= 22 || h < 6 ? "sleepy" : "idle"; };
let pendingMood = null; // e.g. "munch" after a meal is added, played when you're back on the home screen
function mountCats() {
  for (const wrap of document.querySelectorAll("[data-cat]")) {
    const cat = cats[wrap.dataset.cat];
    if (!cat) continue;
    cat.ready().then(() => {
      if (!wrap.isConnected) return;
      if (cat.canvas.parentNode !== wrap) wrap.appendChild(cat.canvas);
      wrap.classList.add("has-anim");
      cat.start();
    }).catch(() => { /* the still picture stays */ });
    if (wrap.dataset.cat === "hero") cat.setBase(state.view === "login" ? "hello" : "idle");
    else catMoodsForToday(cat);
  }
}
function catMoodsForToday(cat) {
  cat.setBase(catMood());
  const today = iso(new Date());
  let seen = null;
  try { seen = localStorage.getItem("munchkin.hello"); } catch {}
  if (seen !== today) { try { localStorage.setItem("munchkin.hello", today); } catch {} cat.play("hello", 3.2); return; }
  if (pendingMood) { cat.play(pendingMood, pendingMood === "munch" ? 4.5 : 2.6); pendingMood = null; return; }
  // protein goal reached today: a little cheer, once a day
  const g = goalsOn(today);
  if (g?.protein && state.date === today && state.meals?.length) {
    const t = sumItems(state.meals.filter(isMealDoc).flatMap((m) => m.items || []));
    let cheered = null;
    try { cheered = localStorage.getItem("munchkin.cheer"); } catch {}
    if (t.protein >= g.protein && cheered !== today) { try { localStorage.setItem("munchkin.cheer", today); } catch {} cat.play("happy", 2.6); }
  }
}
$app.addEventListener("click", (e) => {
  const wrap = e.target.closest?.("[data-cat]");
  if (wrap && cats[wrap.dataset.cat]) cats[wrap.dataset.cat].play("happy", 1.6);
});

function render() {
  renderView();
  mountCats();
}
function renderView() {
  if (state.view === "loading") {
    $app.innerHTML = `<div class="login"><div class="inner"><div class="hero-cat" data-cat="hero">${catPic()}</div><p>Waking Munchkin up…</p></div></div>`;
    return;
  }
  if (state.view === "login") return renderLogin();
  if (state.view === "settings") return renderSettings();
  if (state.view === "goals") return renderGoals();
  if (state.view === "calendar") return renderCalendar();
  if (state.view === "barcode") return renderBarcode();
  if (state.view === "manual") return renderManual();
  if (state.view === "body") return renderBody();
  if (state.view === "cycle") return renderCycle();
  if (state.view === "meal") return renderMeal();
  return renderDay();
}

function renderLogin() {
  $app.innerHTML = `
  <main class="login">
    <div class="inner">
      <div class="hero-cat" data-cat="hero">${catPic()}</div>
      <h1>Munchkin</h1>
      <p>Snap what you eat. Munchkin guesses the calories, and you fix anything by chatting.</p>
      <button class="google-btn" data-action="signin">${ICON.google} Log in with Google</button>
      ${state.loginError ? `<p class="status-line bad">${esc(state.loginError)}</p>` : ""}
      <p style="font-size:.82rem">Your diary is private. Only you can see it.</p>
    </div>
  </main>`;
}

const isMealDoc = (d) => !d.type || d.type === "meal";
function dayBurn(docs) {
  const ex = docs.filter((d) => d.type === "exercise").reduce((n, d) => n + (d.burned || 0), 0);
  const st = docs.find((d) => d.type === "steps");
  const sb = st ? stepsBurn(st.steps, state.goals?.profile, state.usualSteps).burned : 0;
  return { exercise: ex, steps: sb, total: ex + sb };
}

function renderDay() {
  const meals = state.meals.filter(isMealDoc);
  const t = sumItems(meals.flatMap((m) => m.items || []));
  const isToday = state.date === iso(new Date());
  const bubble = meals.length === 0
    ? (isToday ? "What did you munch today?" : "Nothing logged this day.")
    : `${meals.length} meal${meals.length > 1 ? "s" : ""} logged`;
  const needKey = !demo && !hasKey();

  const slotsHTML = SLOTS.map(([id, label]) => {
    const list = meals.filter((m) => (m.slot || "snack") === id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const st = sumItems(list.flatMap((m) => m.items || []));
    return `
    <section class="slot" data-slot="${id}">
      <div class="slot-head"><h2>${label}</h2>${list.length ? `<span class="sum">${st.calories} kcal</span>` : ""}</div>
      <div class="meal-list">
        ${list.map((m) => {
          const mt = sumItems(m.items);
          if (state.confirmDeleteId === m.id) {
            return `<div class="meal-card confirm-row"><span class="info"><span class="name">Delete “${esc(m.name || "Meal")}”?</span><span class="mini">It's gone for good.</span></span>
              <span class="btn-row"><button class="btn danger small" data-action="home-delete" data-id="${esc(m.id)}">Delete</button><button class="btn ghost small" data-action="home-keep">Keep</button></span></div>`;
          }
          return `<div class="meal-wrap" data-drag="${esc(m.id)}"><button class="meal-card" data-action="open-meal" data-id="${esc(m.id)}">
            ${m.photo ? `<img class="thumb" src="${esc(m.photo)}" alt="Open photo" data-action="view-thumb" data-id="${esc(m.id)}">` : `<span class="thumb">${catPic("small", "")}</span>`}
            <span class="info"><span class="name">${esc(m.name || "Meal")}</span>
              <span class="mini">P ${mt.protein}g · C ${mt.carbs}g · F ${mt.fat}g</span></span>
            <span class="kc">${mt.calories} kcal</span>
          </button><button class="del-btn" data-action="home-ask-delete" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name || "meal")}">${ICON.trash}</button></div>`;
        }).join("")}
        <button class="add-slot ${list.length ? "small" : ""}" data-action="open-sheet" data-slot="${id}">+ Add ${list.length ? "more to " : ""}${label.toLowerCase()}</button>
      </div>
    </section>`;
  }).join("");

  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <span class="logo-cat">${catPic("small", "")}</span>
      <h1>Munchkin</h1>
      <span class="spacer"></span>
      <button class="icon-btn" data-action="ask" aria-label="Just asking: ask Munchkin a question">💬</button>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${ICON.gear}</button>
    </header>
    ${needKey || !state.goals ? `<div class="card welcome"><h2>${needKey ? "Welcome to Munchkin! 🐱" : "Almost there!"}</h2>
      <ol>
        <li class="${needKey ? "" : "done"}"><span>${needKey ? "1" : "✓"}</span><div><strong>Add your AI key</strong><small>So Munchkin can guess your food. Gemini's is free.</small></div>${needKey ? `<button class="btn small" data-action="settings">Add key</button>` : ""}</li>
        <li class="${state.goals ? "done" : ""}"><span>${state.goals ? "✓" : "2"}</span><div><strong>Set your daily goals</strong><small>Munchkin works out your calories and macros.</small></div>${state.goals ? "" : `<button class="btn small" data-action="goals">Set goals</button>`}</li>
      </ol></div>` : ""}
    <nav class="datenav" aria-label="Choose day">
      <button class="icon-btn" data-action="prev-day" aria-label="Previous day">${ICON.back}</button>
      <button class="label" data-action="calendar" aria-label="Open calendar"><strong>${prettyDate(state.date)}</strong><span>${longDate(state.date)} · 📅</span></button>
      <button class="icon-btn" data-action="next-day" aria-label="Next day" ${isToday ? "disabled" : ""}>${ICON.next}</button>
    </nav>
    ${summaryHTML(t, bubble, dayBurn(state.meals))}
    ${bodyCardHTML()}
    ${cycleCardHTML()}
    ${weekHTML()}
    ${slotsHTML}
    ${waterHTML()}
    ${exerciseSectionHTML()}
  </main>
  <div class="fab-row">
    <button class="fab-2" data-action="open-ex" aria-label="Add exercise">🏃 Exercise</button>
    <button class="fab" data-action="open-sheet">${ICON.plus} Add meal</button>
  </div>
  ${state.sheet ? sheetHTML() : ""}
  ${state.exSheet ? exSheetHTML() : ""}`;
}

function bar(value, goal, cls = "") {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return `<div class="bar ${cls} ${value > goal ? "over" : ""}"><i style="width:${pct}%"></i></div>`;
}
function summaryHTML(t, bubble, burn = { total: 0 }) {
  const g0 = goalsOn(state.date);
  const g = g0 ? { ...g0, calories: g0.calories + burn.total } : null;
  if (!g) {
    return `<section class="summary">
      <div class="cat-wrap" data-cat="day">${catPic()}</div>
      <div>
        <div class="kcal">${t.calories}<small>kcal</small></div>
        <p class="bubble">${bubble}</p>
        ${burn.total ? `<p class="burn-note">🔥 ${burn.total} kcal burned</p>` : ""}
        ${macrosHTML(t)}
        <button class="link-btn" data-action="goals">🎯 Set my daily goals</button>
      </div>
    </section>`;
  }
  const left = g.calories - t.calories;
  const leftText = left >= 0 ? `<strong>${left}</strong> kcal left` : `<strong>${-left}</strong> kcal over your goal`;
  const row = (key, label, cls) => `<div class="mrow"><span class="mlabel"><i class="${cls}"></i>${label}</span><span class="mval">${t[key]} / ${g[key]} g</span>${bar(t[key], g[key], cls)}</div>`;
  return `<section class="summary goals">
    <div class="cat-wrap" data-cat="day">${catPic()}</div>
    <div class="ginfo">
      <div class="kcal">${t.calories}<small> / ${g.calories} kcal</small></div>
      <p class="bubble">${leftText}</p>
      ${burn.total ? `<p class="burn-note">🔥 ${burn.total} kcal burned added to your goal (${g0.calories} + ${burn.total})</p>` : ""}
      ${bar(t.calories, g.calories, "big")}
    </div>
    <div class="macro-bars">
      ${row("protein", "Protein", "p")}${row("carbs", "Carbs", "c")}${row("fat", "Fat", "f")}
    </div>
  </section>`;
}

function exerciseSectionHTML() {
  const ex = state.meals.filter((d) => d.type === "exercise").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const st = state.meals.find((d) => d.type === "steps");
  const sb = st ? stepsBurn(st.steps, state.goals?.profile, state.usualSteps) : null;
  const emoji = (k) => (EXERCISES.find((e) => e[0] === k)?.[1] || "✨").split(" ")[0];
  return `<section class="slot">
    <div class="slot-head"><h2>Exercise</h2>${ex.length || sb?.burned ? `<span class="sum">🔥 ${dayBurn(state.meals).total} kcal</span>` : ""}</div>
    <div class="meal-list">
      ${ex.map((e) => state.confirmDeleteId === e.id
        ? `<div class="meal-card confirm-row"><span class="info"><span class="name">Delete “${esc(e.name)}”?</span></span>
           <span class="btn-row"><button class="btn danger small" data-action="home-delete" data-id="${esc(e.id)}">Delete</button><button class="btn ghost small" data-action="home-keep">Keep</button></span></div>`
        : `<div class="meal-wrap"><button class="meal-card ex-card" data-action="edit-ex" data-id="${esc(e.id)}">
          <span class="thumb ex-emoji">${emoji(e.kind)}</span>
          <span class="info"><span class="name">${esc(e.name)}</span><span class="mini">${e.minutes} min${e.effort ? ` · ${esc((EFFORT.find((x) => x[0] === e.effort) || [, ""])[1].toLowerCase())}` : ""}</span></span>
          <span class="kc">−${e.burned} kcal</span>
        </button><button class="del-btn" data-action="home-ask-delete" data-id="${esc(e.id)}" aria-label="Delete ${esc(e.name)}">${ICON.trash}</button></div>`).join("")}
      <div class="steps-row">
        <label for="steps-input">👣 Steps</label>
        <input id="steps-input" type="number" inputmode="numeric" placeholder="${isNative() ? "syncing…" : "type your steps"}" value="${st ? esc(st.steps) : ""}" data-saved="${st ? esc(st.steps) : ""}">
        <button class="btn small" data-action="save-steps" id="steps-save" hidden>Save</button>
        ${sb || st?.source ? `<span class="steps-note">${[st?.source ? "Synced from Google Fit" : "", sb ? (sb.burned ? `🔥 ${sb.burned} kcal extra` : "within your usual day") : ""].filter(Boolean).join(" · ")}</span>` : ""}
        ${lowStepsHint(st) ? `<span class="steps-note tip">Looks low? <button class="link-btn" data-action="hc-settings">Check Fit's sync</button></span>` : ""}
        ${state.health === "ask" ? `<button class="btn small" data-action="health-connect">Connect Google Fit</button>` : ""}
        ${state.health === "missing" ? `<span class="steps-note">Health Connect isn't on this phone. <button class="link-btn" data-action="health-store">Get it</button></span>` : ""}
        ${state.health === "error" ? `<span class="steps-note">Couldn't read steps: ${esc(state.healthError || "")}</span>` : ""}

      </div>
      <button class="add-slot" data-action="open-ex">+ Add exercise</button>
    </div>
  </section>`;
}

// Late in the day with almost no steps usually means Google Fit stopped sharing them.
function lowStepsHint(st) {
  if (!isNative() || state.date !== iso(new Date()) || new Date().getHours() < 14) return false;
  return !st || Number(st.steps) < 1000;
}

function exSheetHTML() {
  const x = state.exSheet;
  const kg = Number(state.goals?.profile?.weight) || 65;
  const preset = EXERCISES.find((e) => e[0] === x.kind);
  const effortIdx = Math.max(0, EFFORT.findIndex((e) => e[0] === x.effort));
  const auto = preset ? exerciseBurn(preset[2][effortIdx], Number(x.minutes) || 0, kg) : null;
  const burned = x.custom ? x.burned : auto;
  return `
  <div class="sheet-backdrop" data-action="close-ex">
    <div class="sheet" role="dialog" aria-label="Add exercise" data-stop>
      <h3>${x.id ? "Edit exercise" : "Add exercise"}</h3>
      <div class="ex-grid">
        ${EXERCISES.map(([id, label]) => `<button class="chip" data-action="ex-kind" data-kind="${id}" aria-pressed="${x.kind === id && !x.custom}">${label}</button>`).join("")}
      </div>
      <div class="field-row two">
        <div class="field"><label for="ex-min">Minutes</label><input id="ex-min" type="number" inputmode="numeric" value="${esc(x.minutes)}"></div>
        <div class="field"><label>Effort</label><div class="chips">${EFFORT.map(([id, label]) => `<button class="chip" data-action="ex-effort" data-effort="${id}" aria-pressed="${x.effort === id}">${label}</button>`).join("")}</div></div>
      </div>
      <details class="ex-other" ${x.custom ? "open" : ""}>
        <summary>Something else? Describe it</summary>
        <div class="field"><textarea id="ex-desc" rows="2" placeholder="e.g. 1 hour of tennis, quite intense">${esc(x.desc || "")}</textarea></div>
        <div class="btn-row"><button class="btn ghost small" data-action="ex-ask" ${x.asking ? "disabled" : ""}>${x.asking ? "Munchkin is thinking…" : "Ask Munchkin"}</button></div>
        ${x.note ? `<p class="help">${esc(x.note)}</p>` : ""}
      </details>
      <div class="ex-result">
        <span>${x.custom ? esc(x.name || "Exercise") : esc(preset ? preset[1].split(" ").slice(1).join(" ") : "Pick an exercise")}</span>
        <strong>${burned != null ? `🔥 ${burned} kcal` : "—"}</strong>
      </div>
      <p class="help">Calories burned on top of resting, estimated from your weight (${kg} kg${state.goals?.profile?.weight ? "" : ", set it in Goals for better numbers"}). Walks are already in your steps, so don't add them here.</p>
      <div class="btn-row"><button class="btn" data-action="ex-save" ${burned == null ? "disabled" : ""}>${x.id ? "Save" : "Add"}</button><button class="btn ghost" data-action="close-ex">Cancel</button></div>
    </div>
  </div>`;
}

function weekHTML() {
  const w = state.week;
  if (!w || w.days < 2) return "";
  const kg = w.kgWeek;
  const pace = Math.abs(kg) < 0.05 ? "about steady" : `about ${kg > 0 ? "+" : "−"}${Math.abs(kg).toFixed(2)} kg a week`;
  const ph = todayPhase();
  const cyc = ph && (ph.phase === "pre" || ph.phase === "period") ? ` <span>${ph.phase === "pre" ? "Your period is due soon, so the scale may read higher this week from water." : "During your period the scale often reads higher from water."}</span>` : "";
  return `<p class="week-note">📈 Last 7 days: you averaged <strong>${w.avg} kcal</strong> a day${w.burn ? ` (minus ${w.burn} burned)` : ""} over ${w.days} logged days. At this pace that's <strong>${pace}</strong>. <span>Estimate. Water and salt make the scale jump around.</span>${cyc}</p>`;
}
let weekTimer = null;
let stepsLearnedFor = "";
async function learnSteps() {
  const today = iso(new Date());
  if (stepsLearnedFor === today) return;
  try {
    const docs = await store.getRange(shiftDate(today, -14), shiftDate(today, -1));
    const usual = learnUsualSteps(docs.filter((d) => d.type === "steps").map((d) => Number(d.steps) || 0));
    stepsLearnedFor = today;
    if (usual !== state.usualSteps) { state.usualSteps = usual; if (state.view === "day" || state.view === "settings") render(); }
  } catch { /* try again next time */ }
}
function refreshWeek() {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(async () => {
    learnSteps();
    const maint = state.goals?.maintenance;
    if (!maint) { state.week = null; return; }
    const end = iso(new Date()), start = shiftDate(end, -6);
    try {
      const docs = await store.getRange(start, end);
      const byDay = {};
      for (const d of docs) (byDay[d.date] ||= []).push(d);
      const days = Object.values(byDay).filter((list) => list.some(isMealDoc));
      if (!days.length) { state.week = null; }
      else {
        let eaten = 0, burn = 0;
        for (const list of days) {
          eaten += sumItems(list.filter(isMealDoc).flatMap((m) => m.items || [])).calories;
          burn += dayBurn(list).total;
        }
        const avg = Math.round(eaten / days.length), avgBurn = Math.round(burn / days.length);
        state.week = { days: days.length, avg, burn: avgBurn, kgWeek: ((avg - avgBurn - maint) * 7) / KCAL_PER_KG };
      }
    } catch { state.week = null; }
    if (state.view === "day") render();
  }, 800);
}

function sheetHTML() {
  return `
  <div class="sheet-backdrop" data-action="close-sheet">
    <div class="sheet" role="dialog" aria-label="Add a meal" data-stop>
      <h3>Add a meal</h3>
      <div class="chips">
        ${SLOTS.map(([id, label]) => `<button class="chip" data-action="sheet-slot" data-slot="${id}" aria-pressed="${state.sheetSlot === id}">${label}</button>`).join("")}
      </div>
      <div class="big-actions">
        <label class="big-action">${ICON.camera}<span>Take photo</span><input type="file" id="pick-camera" accept="image/*" capture="environment"></label>
        <label class="big-action">${ICON.image}<span>From gallery</span><input type="file" id="pick-gallery" accept="image/*" multiple></label>
        <button class="big-action" data-action="type-meal">${ICON.pen}<span>Type it</span></button>
        <label class="big-action"><span class="ba-emoji">📋</span><span>Scan a label</span><input type="file" id="pick-label" accept="image/*" capture="environment"></label>
        <label class="big-action"><span class="ba-emoji">▥</span><span>Barcode</span><input type="file" id="pick-barcode" accept="image/*" capture="environment"></label>
        <button class="big-action" data-action="manual"><span class="ba-emoji">🔢</span><span>Manual</span></button>
      </div>
      <p class="help">Label: snap the nutrition table on the package. Barcode: snap the stripes, and Munchkin looks it up in a free food database.</p>
    </div>
  </div>`;
}

// ---------- drag a meal to another meal slot (press and hold on a phone) ----------
const drag = { timer: null, id: null, el: null, ghost: null, startX: 0, startY: 0, dx: 0, dy: 0, active: false, over: null, justDropped: 0 };
function dragStart(x, y, target) {
  const wrap = target.closest?.("[data-drag]");
  if (!wrap || state.view !== "day" || target.closest(".del-btn")) return false;
  drag.id = wrap.dataset.drag; drag.el = wrap; drag.startX = x; drag.startY = y;
  clearTimeout(drag.timer);
  drag.timer = setTimeout(() => dragBegin(x, y), 380);
  return true;
}
function dragBegin(x, y) {
  if (!drag.el?.isConnected) drag.el = document.querySelector(`[data-drag="${CSS.escape(drag.id)}"]`); // the list may have been redrawn
  if (!drag.el) { dragCancel(); return; }
  const r = drag.el.getBoundingClientRect();
  drag.dx = x - r.left; drag.dy = y - r.top;
  const g = drag.el.cloneNode(true);
  g.className = "meal-wrap drag-ghost"; g.style.width = r.width + "px";
  g.style.left = r.left + "px"; g.style.top = r.top + "px";
  document.body.appendChild(g);
  drag.ghost = g; drag.active = true;
  drag.el.classList.add("drag-src");
  document.body.classList.add("dragging");
  navigator.vibrate?.(15);
}
function dragMove(x, y) {
  if (!drag.id) return;
  if (!drag.active) { if (Math.hypot(x - drag.startX, y - drag.startY) > 10) dragCancel(); return; }
  drag.ghost.style.left = x - drag.dx + "px"; drag.ghost.style.top = y - drag.dy + "px";
  drag.ghost.hidden = true;
  const slot = document.elementFromPoint(x, y)?.closest?.(".slot[data-slot]");
  drag.ghost.hidden = false;
  if (drag.over !== slot) { drag.over?.classList.remove("drop-here"); slot?.classList.add("drop-here"); drag.over = slot; }
  // scroll the page when dragging near the top or bottom edge
  const edge = 80;
  if (y < edge) window.scrollBy(0, -12); else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
}
async function dragEnd() {
  if (!drag.active) { dragCancel(); return; }
  const to = drag.over?.dataset.slot, id = drag.id;
  drag.justDropped = Date.now();
  dragCancel();
  const m = state.meals.find((x) => x.id === id);
  if (!m || !to || (m.slot || "snack") === to) return;
  m.slot = to; render();
  try { await store.save({ ...m, updatedAt: Date.now() }); toast(`Moved to ${SLOT_NAME[to].toLowerCase()} 🐱`); }
  catch { toast("Couldn't move it. Try again."); }
}
function dragCancel() {
  clearTimeout(drag.timer);
  drag.ghost?.remove(); drag.el?.classList.remove("drag-src"); drag.over?.classList.remove("drop-here");
  document.body.classList.remove("dragging");
  Object.assign(drag, { timer: null, id: null, el: null, ghost: null, active: false, over: null });
}
$app.addEventListener("touchstart", (e) => { if (e.touches.length === 1) dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target); }, { passive: true });
document.addEventListener("touchmove", (e) => { if (!drag.id) return; if (drag.active) e.preventDefault(); dragMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
document.addEventListener("touchend", () => { if (drag.id) dragEnd(); });
document.addEventListener("touchcancel", dragCancel);
$app.addEventListener("mousedown", (e) => { if (e.button === 0 && dragStart(e.clientX, e.clientY, e.target)) e.preventDefault(); });
document.addEventListener("mousemove", (e) => { if (drag.id) dragMove(e.clientX, e.clientY); });
document.addEventListener("mouseup", () => { if (drag.id) dragEnd(); });
document.addEventListener("contextmenu", (e) => { if (drag.id) e.preventDefault(); });
// a drop shouldn't also open the meal
document.addEventListener("click", (e) => { if (Date.now() - drag.justDropped < 400) { e.preventDefault(); e.stopPropagation(); } }, true);

// ---------- typing the numbers yourself (no AI) ----------
function renderManual() {
  const f = state.manual || {};
  const num = (id, label, unit) => `<div class="field"><label for="mn-${id}">${label} (${unit})</label><input id="mn-${id}" type="number" inputmode="decimal" min="0" value="${esc(f[id] ?? "")}" placeholder="0"></div>`;
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Manual</h1>
    </header>
    <section class="card">
      <div class="field"><label for="mn-name">Name</label><input id="mn-name" type="text" maxlength="60" value="${esc(f.name || "")}" placeholder="e.g. Protein bar"></div>
      <div class="field-row two">${num("calories", "Calories", "kcal")}${num("protein", "Protein", "g")}</div>
      <div class="field-row two">${num("carbs", "Carbs", "g")}${num("fat", "Fat", "g")}</div>
      <div class="field"><label>Meal</label>
        <div class="chips">${SLOTS.map(([id, label]) => `<button class="chip" data-action="manual-slot" data-slot="${id}" aria-pressed="${state.sheetSlot === id}">${label}</button>`).join("")}</div>
      </div>
      <p id="mn-check" class="help">Only calories are needed. Leave the rest empty if you don't know them.</p>
      <div class="btn-row"><button class="btn" data-action="manual-save">Add to ${prettyDate(state.date).toLowerCase()}</button></div>
    </section>
  </main>`;
}
function readManual() {
  const v = (id) => document.getElementById(`mn-${id}`)?.value ?? "";
  state.manual = { name: v("name"), calories: v("calories"), protein: v("protein"), carbs: v("carbs"), fat: v("fat") };
  return state.manual;
}

function renderMeal() {
  const m = state.meal;
  if (!m) { state.view = "day"; return render(); }
  const t = sumItems(m.items);
  const firstTime = m.chat.length === 0;
  const draftPhotos = [...(firstTime && m.photo && !m.photoFromChat ? [m.photo] : []), ...(state.pendingPhotos || [])];
  const hasDraftPhoto = draftPhotos.length > 0 && !state.sending;
  const placeholder = hasDraftPhoto ? "Add a note (optional), or just tap send ➜" : m.askOnly ? "Ask anything, e.g. calories in a croissant?" : firstTime ? "What did you eat? e.g. two slices of pizza" : "Fix anything, or add a photo";
  const pendingStart = (firstTime && m.photo && !m.photoFromChat) ? 1 : 0;
  const draftHTML = hasDraftPhoto ? `<div class="msg user draft">
      <div class="chat-photos n${Math.min(draftPhotos.length, 3)}">${draftPhotos.map((ph, i) => `<span class="dph"><img class="chat-photo" src="${esc(ph)}" alt="Photo ready to send" data-action="view-photo" data-src="${esc(ph)}">${i >= pendingStart ? `<button class="dx" data-action="drop-photo" data-i="${i - pendingStart}" aria-label="Remove photo">✕</button>` : ""}</span>`).join("")}</div>
      <span id="draft-text" class="draft-text">${esc(state.composer || "")}</span>
      <span class="draft-label">Ready to send, tap ➜</span>
    </div>` : "";

  const chatHTML = m.chat.map((c, i) => {
    if (c.role === "model") {
      const src = (c.sources || []).length ? `<span class="sources">🔎 Checked: ${c.sources.map((x) => `<a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join(", ")}</span>` : "";
      const isLast = i === m.chat.length - 1 && !state.sending;
      const qs = c.questions || (c.options?.length ? [{ question: "", options: c.options }] : []);
      let chips = "";
      if (isLast && qs.length === 1) {
        chips = `<div class="quick-replies">${qs[0].options.map((o) => `<button class="chip" data-action="quick" data-text="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
      } else if (isLast && qs.length > 1) {
        const picked = state.answers || {};
        chips = `<div class="quick-replies multi">${qs.map((q, qi) => `
          <div class="q-group"><span class="q-label">${esc(q.question)}</span>
            <div class="q-opts">${q.options.map((o) => `<button class="chip" data-action="pick-answer" data-q="${qi}" data-text="${esc(o)}" aria-pressed="${picked[qi] === o}">${esc(o)}</button>`).join("")}</div>
          </div>`).join("")}
          <button class="btn" data-action="send-answers" ${Object.keys(picked).length ? "" : "disabled"}>Send answers</button>
        </div>`;
      }
      return `<div class="model-row"><span class="mini-cat">${catSVG({ label: "", head: true })}</span><div class="msg model">${pretty(c.text)}${src}</div></div>${chips}`;
    }
    const txt = c.text || "";
    const cPics = [c.photo, ...(c.photos || [])].filter(Boolean);
    const note = i === 0 && m.photo && !m.photoFromChat ? `<span class="photo-note">📷 photo sent</span>` : "";
    const pic = cPics.length ? `<div class="chat-photos n${Math.min(cPics.length, 3)}">${cPics.map((ph) => `<img class="chat-photo" src="${esc(ph)}" alt="Photo you sent" data-action="view-photo" data-src="${esc(ph)}">`).join("")}</div>` : "";
    return `<div class="msg user">${pic}${txt ? esc(txt) : (pic ? "" : "What's this?")}${note}</div>`;
  }).join("");

  $app.innerHTML = `
  <main class="screen">
    <header class="topbar meal-top">
      <button class="icon-btn" data-action="back" aria-label="Back to day">${ICON.back}</button>
      ${m.askOnly
        ? `<div class="title"><strong>💬 Just asking</strong><span>Nothing is saved unless you add it</span></div>
           <button class="btn ghost small" data-action="ask-new">New question</button>`
        : `<div class="title"><strong>${esc(m.items.length ? m.name : "New meal")}</strong><span>${SLOT_NAME[m.slot] || "Meal"} · ${prettyDate(m.date)}</span></div>
           ${m._draft ? "" : `<button class="icon-btn" data-action="ask-delete" aria-label="Delete meal">${ICON.trash}</button>`}`}
    </header>
    ${state.confirmDelete ? `<div class="confirm"><strong>Delete this meal?</strong><p style="margin:0;color:var(--muted)">It disappears from your diary for good.</p>
      <div class="btn-row"><button class="btn danger" data-action="delete">Delete</button><button class="btn ghost" data-action="cancel-delete">Keep it</button></div></div>` : ""}
    ${m.items.length ? `
    <section class="nutri">
      <div class="row"><span class="kcal">${m.estimate ? "≈" : ""}${t.calories}<small> kcal</small></span>${m.estimate ? `<span class="estimate">estimate, pick your option below</span>` : ""}</div>
      ${macrosHTML(t)}
      ${m.askOnly ? `<div class="btn-row"><button class="btn" data-action="ask-add">+ Add to today's ${SLOT_NAME[m.slot].toLowerCase()}</button></div>` : ""}
      <ul class="items">${m.items.map((it) => `<li><span>${esc(it.name)} <em>${esc(it.amount)}</em></span><span>${it.calories} kcal</span></li>`).join("")}</ul>
    </section>` : ""}
    ${m.photo && !(firstTime && !m.photoFromChat) ? `<button class="meal-photo" data-action="view-photo" data-src="${esc(m.photo)}" aria-label="Open photo full screen"><img src="${esc(m.photo)}" alt="Your meal photo"></button>` : ""}
    <div class="chips slot-row" aria-label="Meal time">
      ${SLOTS.map(([id, label]) => `<button class="chip" data-action="meal-slot" data-slot="${id}" aria-pressed="${m.slot === id}">${label}</button>`).join("")}
    </div>
    <section class="chat" aria-label="Chat with Munchkin">
      ${firstTime && !state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "", head: true })}</span><div class="msg model">${m.askOnly ? "Ask me anything about food! Like \"how many calories in a croissant?\" or \"which is lighter, a wrap or a salad?\". Nothing goes in your diary unless you tap Add." : m.photo ? "Got your photo! Add details if you like, such as \"I only ate half\", or just send it as it is." : "Tell me what you ate and roughly how much!"}</div></div>` : ""}
      ${chatHTML}
      ${draftHTML}
      ${state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "", head: true })}</span><div><div class="msg model thinking" aria-label="Munchkin is thinking"><i></i><i></i><i></i></div><div class="ai-status" id="ai-status"></div></div></div>` : ""}
      ${state.error ? `<div class="msg error">${esc(state.error.text)}
        <div class="btn-row" style="margin-top:8px">${state.error.retry ? `<button class="btn" data-action="retry">Try again</button>` : ""}${state.error.settings ? `<button class="btn ghost" data-action="settings">Open settings</button>` : ""}</div></div>` : ""}
    </section>
  </main>
  <div class="composer">
    <form data-form="chat">
      <label class="photo-btn" aria-label="Take a photo">${ICON.camera}<input type="file" id="pick-chat-camera" accept="image/*" capture="environment"></label>
      <label class="photo-btn" aria-label="Add photos from your gallery">${ICON.image}<input type="file" id="pick-chat-photo" accept="image/*" multiple></label>
      <textarea id="composer" rows="1" placeholder="${esc(placeholder)}" aria-label="Message to Munchkin"></textarea>
      <button class="send-btn ${hasDraftPhoto ? "ready" : ""}" type="submit" aria-label="Send" ${state.sending ? "disabled" : ""}>${ICON.send}</button>
    </form>
  </div>`;
  const ta = document.getElementById("composer");
  ta.value = state.composer;
  autoGrow(ta);
}

const KEY_HELP = {
  gemini: ["Gemini", "https://aistudio.google.com/apikey", "Get a free one from Google AI Studio", "tap \"Create API key\""],
  openai: ["ChatGPT", "https://platform.openai.com/api-keys", "Make one on platform.openai.com", "tap \"Create new secret key\" (needs a few dollars of credit)"],
  claude: ["Claude", "https://console.anthropic.com/settings/keys", "Make one on console.anthropic.com", "tap \"Create key\" (needs a few dollars of credit)"],
};
function renderSettings() {
  const s = loadAISettings();
  const prov = KEY_HELP[s.provider] ? s.provider : "gemini";
  const [pname, plink, plinkText, pstep] = KEY_HELP[prov];
  const key = s.keys?.[prov] || "";
  const u = state.user || {};
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Settings</h1>
    </header>
    <section class="card">
      <h2>Food-guessing AI</h2>
      <div class="radio-list">
        ${PROVIDERS.map((p) => `<label class="radio ${p.ready ? "" : "disabled"}"><input type="radio" name="provider" value="${p.id}" ${s.provider === p.id ? "checked" : ""} ${p.ready ? "" : "disabled"}><span><strong>${p.name}</strong><small>${p.note}</small></span></label>`).join("")}
      </div>
      <div class="field">
        <label for="gemini-key">Your ${pname} key</label>
        <input id="gemini-key" type="${state.showKey ? "text" : "password"}" autocomplete="off" spellcheck="false" placeholder="Paste it here" value="${esc(key)}">
      </div>
      <div class="btn-row">
        <button class="btn" data-action="save-key">Save and test</button>
        <button class="btn ghost" data-action="toggle-key">${state.showKey ? "Hide" : "Show"}</button>
      </div>
      ${state.settingsStatus ? `<p class="status-line ${state.settingsStatus.ok ? "ok" : "bad"}">${esc(state.settingsStatus.text)}</p>` : ""}
      ${state.settingsStatus?.live ? `<p class="ai-status" id="ai-status"></p>` : ""}
      <p>No key yet? <a href="${plink}" target="_blank" rel="noopener">${plinkText}</a>, ${pstep}, copy it, and paste it above.</p>
      <label class="toggle"><input type="checkbox" id="sync-keys" ${s.syncKeys ? "checked" : ""}><span><strong>Remember my keys on my account</strong><small>Paste once, works on all your devices. Only you can read them.</small></span></label>
    </section>
    <section class="card">
      <h2>Daily goals</h2>
      ${state.goals ? `<p>${state.goals.calories} kcal · protein ${state.goals.protein} g · carbs ${state.goals.carbs} g · fat ${state.goals.fat} g</p>` : `<p>Not set yet. Munchkin can work them out for you.</p>`}
      <p>${state.usualSteps ? `Your usual: about <strong>${state.usualSteps.toLocaleString()} steps a day</strong>, learned from your last 2 weeks. Steps above that count as extra calories burned.` : "Munchkin learns your usual steps after about a week of step counts. Until then it uses the usual for your activity level."}</p>
      <div class="btn-row"><button class="btn" data-action="goals">${state.goals ? "Change my goals" : "Set my goals"}</button></div>
    </section>
    ${isNative() ? "" : `<section class="card">
      <h2>Android app 🤖</h2>
      <p>Munchkin as a real Android app: everything you have here, plus your steps from Google Fit synced automatically.</p>
      <div class="btn-row"><a class="btn" href="https://github.com/dstephanova/munchkin/releases/latest/download/munchkin.apk">Download for Android</a></div>
      <p class="help">After downloading, open the file to install. Your phone may ask you to allow installing apps from your browser; that's normal for apps not from the Play Store.</p>
    </section>`}
    <section class="card">
      <h2>Backup</h2>
      <p>Download your whole diary (meals, exercise, water, goals) as a file, just in case. You can load it back any time.</p>
      <div class="btn-row">
        <button class="btn" data-action="backup">Download backup</button>
        <label class="btn ghost">Restore from a file<input type="file" id="restore-file" accept=".json,application/json" hidden></label>
      </div>
      ${state.backupStatus ? `<p class="status-line ${state.backupStatus.ok ? "ok" : "bad"}">${esc(state.backupStatus.text)}</p>` : ""}
    </section>
    <section class="card">
      <h2>Account</h2>
      <p>${u.name ? `${esc(u.name)}<br>` : ""}${esc(u.email || "")}</p>
      <p>Your diary is saved online, so it's safe even if you reset your phone. Only you can see it.</p>
      <div class="btn-row"><button class="btn ghost" data-action="signout">Log out</button></div>
    </section>
  </main>`;
}

const TARGETS = [["calories", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"]];

// ---------- goals per day ----------
// Every change to the targets is remembered from that day on, so past days keep the goals they had.
const pickTargets = (g) => ({ calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat, maintenance: g.maintenance ?? null });
async function saveGoalsKeepingHistory(next) {
  const prev = state.goals;
  const today = iso(new Date());
  let history = Array.isArray(prev?.history) ? prev.history.slice()
    : prev ? [{ from: "0000-00-00", ...pickTargets(prev) }] : []; // first time: older days keep the goals they had
  history = history.filter((h) => h.from !== today);
  history.push({ from: today, ...pickTargets(next) });
  history.sort((a, b) => a.from.localeCompare(b.from));
  await store.saveGoals({ ...next, history: history.slice(-60) });
}
function goalsOn(date) {
  const g = state.goals;
  if (!g) return null;
  const h = Array.isArray(g.history) ? g.history : [];
  const entry = [...h].reverse().find((x) => x.from <= date);
  return entry ? { ...g, ...entry } : g;
}

function openGoals() {
  const g = state.goals;
  const profile = { sex: "female", age: "", height: "", weight: "", activity: "light", goal: "keep", ...(g?.profile || {}) };
  const targets = g ? { calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat } : { calories: "", protein: "", carbs: "", fat: "" };
  state.goalForm = { profile, targets, edited: new Set(g?.edited || []) };
  go("goals");
}

function renderGoals() {
  const f = state.goalForm;
  const p = f.profile;
  const choice = (field, value, label, sub = "") =>
    `<button class="chip ${sub ? "chip-tall" : ""}" data-action="goal-pick" data-field="${field}" data-value="${value}" aria-pressed="${p[field] === value}">${label}${sub ? `<small>${sub}</small>` : ""}</button>`;
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Daily goals</h1>
    </header>
    <section class="card">
      <h2>About you</h2>
      <p>Munchkin uses this to work out what your body needs each day.</p>
      <div class="chips">${choice("sex", "female", "Woman")}${choice("sex", "male", "Man")}</div>
      ${CYCLE_FEATURE && p.sex === "female" ? `<label class="toggle"><input type="checkbox" id="g-cycle" ${p.trackCycle === false ? "" : "checked"}><span><strong>Track my cycle</strong><small>Shows your cycle phases and explains why you might feel heavier or lighter.</small></span></label>` : ""}
      <div class="field-row">
        <div class="field"><label for="g-age">Age</label><input id="g-age" type="number" inputmode="numeric" data-pf="age" value="${esc(p.age)}" placeholder="e.g. 30"></div>
        <div class="field"><label for="g-height">Height (cm)</label><input id="g-height" type="number" inputmode="numeric" data-pf="height" value="${esc(p.height)}" placeholder="e.g. 165"></div>
        <div class="field"><label for="g-weight">Weight (kg)</label><input id="g-weight" type="number" inputmode="decimal" data-pf="weight" value="${esc(p.weight)}" placeholder="e.g. 60"></div>
      </div>
      <div class="field"><label for="g-goalw">Goal weight (kg, optional)</label><input id="g-goalw" type="number" inputmode="decimal" step="0.1" data-pf="goalWeight" value="${esc(p.goalWeight || "")}" placeholder="e.g. 60"><p class="help">Munchkin shows when you might get there, based on your weigh-ins.</p></div>
      <div class="field"><label>How active are you?</label>
        <p class="help">“Exercise” means anything that makes you warm and a bit out of breath for at least 20 minutes: a brisk walk, gym, dancing, cycling, swimming. Normal moving around (housework, shopping, walking around the office) doesn't count, it's already included.</p>
        <div class="chips stack">${ACTIVITY.map(([id, label, sub]) => choice("activity", id, label, sub)).join("")}</div>
        <p class="help">Logging workouts with the Exercise button? Then pick <strong>Mostly sitting</strong>, so they aren't counted twice.</p>
      </div>
      <div class="field"><label>Your goal</label>
        <div id="g-paces">${paceCards()}</div>
      </div>
    </section>
    <section class="card">
      <h2>Your daily targets</h2>
      <p id="g-sug">${sugText()}</p>
      <div class="field-row four">
        ${TARGETS.map(([k, label, unit]) => `<div class="field"><label for="t-${k}">${label} (${unit})</label><input id="t-${k}" type="number" inputmode="numeric" data-tg="${k}" value="${esc(f.targets[k])}"></div>`).join("")}
      </div>
      <p id="g-check" class="status-line">${macroCheck()}</p>
      <p>You can change any number yourself, for example if a doctor or trainer gave you different ones. These are estimates, not medical advice.</p>
      <div class="btn-row"><button class="btn" data-action="save-goals">Save goals</button>${f.edited.size ? `<button class="btn ghost" data-action="goals-reset">Use Munchkin's numbers</button>` : ""}</div>
    </section>
  </main>`;
}
function paceCards() {
  const p = state.goalForm.profile;
  const opts = paceOptions(p);
  const cur = paceOf(p);
  if (!opts) return `<p class="help">Fill in your age, height and weight to see your options.</p>`;
  return `<div class="pace-list">${opts.map((o) => {
    const week = o.kgWeek === 0 ? "keeps your weight steady" : `about ${o.kgWeek > 0 ? "+" : "−"}${Math.abs(o.kgWeek)} kg a week`;
    return `<button class="pace ${o.tooLow ? "too-low" : ""}" data-action="goal-pick" data-field="pace" data-value="${o.id}" aria-pressed="${cur === o.id}" ${o.tooLow ? "disabled" : ""}>
      <span class="pl"><strong>${o.label}</strong><small>${o.tooLow ? `Would go under the safe minimum of ${safeMinimum(p)} kcal` : week}</small></span>
      <span class="pk">${o.tooLow ? "—" : `${o.calories}<small> kcal/day</small>`}</span>
    </button>`;
  }).join("")}</div>`;
}
function sugText() {
  const s = suggestGoals(state.goalForm.profile);
  if (!s) return "Fill in your age, height and weight and Munchkin will suggest your numbers.";
  return `Munchkin suggests <strong>${s.calories} kcal</strong> a day. Your body uses about ${s.maintenance} kcal a day to stay the same.`;
}
function macroCheck() {
  const t = state.goalForm.targets;
  const fromMacros = Math.round((Number(t.protein) || 0) * 4 + (Number(t.carbs) || 0) * 4 + (Number(t.fat) || 0) * 9);
  const min = safeMinimum(state.goalForm.profile);
  if (Number(t.calories) && Number(t.calories) < min) return `Munchkin keeps your goal at ${min} kcal or more. Eating less than that every day isn't healthy.`;
  if (!fromMacros || !Number(t.calories)) return "";
  const diff = fromMacros - Number(t.calories);
  return Math.abs(diff) > 60 ? `Heads-up: your protein, carbs and fat add up to ${fromMacros} kcal, not ${t.calories}.` : "";
}
function refreshGoalSuggestion() {
  const f = state.goalForm;
  const s = suggestGoals(f.profile);
  if (s) {
    for (const [k] of TARGETS) {
      if (f.edited.has(k)) continue;
      f.targets[k] = s[k];
      const el = document.getElementById(`t-${k}`);
      if (el) el.value = s[k];
    }
  }
  const sug = document.getElementById("g-sug"); if (sug) sug.innerHTML = sugText();
  const pc = document.getElementById("g-paces"); if (pc) pc.innerHTML = paceCards();
  const chk = document.getElementById("g-check"); if (chk) chk.textContent = macroCheck();
}

function keepExInputs() {
  const x = state.exSheet; if (!x) return;
  const m = document.getElementById("ex-min"); if (m) x.minutes = m.value;
  const d = document.getElementById("ex-desc"); if (d) x.desc = d.value;
}

// ---------- barcode ----------
// Products you've added before are remembered by barcode, so they're found instantly next time.
const productId = (code) => `product-${String(code).replace(/\D/g, "")}`;
async function rememberProduct(p) {
  if (!p?.code || !p.per100?.calories) return;
  const { code, name, brand, image, packGrams, packText, servingGrams, servingText, per100, source } = p;
  try { await store.save({ id: productId(code), type: "product", code, name, brand: brand || "", image: image || "", packGrams: packGrams || null, packText: packText || "", servingGrams: servingGrams || null, servingText: servingText || "", per100, source: source || "", updatedAt: Date.now() }); }
  catch { /* only a shortcut for next time */ }
}
async function findBarcode(code) {
  const bc = state.bc;
  bc.code = code; bc.status = "looking"; render();
  const found = (p) => { bc.status = "found"; bc.product = p; bc.grams = p.packGrams || 100; };
  try {
    // 1) your own saved products
    let saved = null;
    try { saved = await store.get(productId(code)); } catch {}
    if (state.bc !== bc) return;
    if (saved?.per100?.calories) { found({ ...saved, source: "saved" }); if (state.view === "barcode") render(); return; }
    // 2) Open Food Facts
    let p = null, offError = null;
    try {
      p = demo && code === "1234567890123"
        ? { code, name: "Example lasagna", brand: "Demo", image: "", packGrams: 400, packText: "400 g", servingGrams: null, servingText: "", per100: { calories: 145, protein: 7, carbs: 15, fat: 6 } }
        : await lookupProduct(code);
    } catch (e) { offError = e; }
    if (state.bc !== bc) return;
    if (p && !p.missing) { found({ ...p, source: "off" }); rememberProduct(p); }
    else if (demo || hasKey()) {
      // 3) ask the AI to find it online
      bc.status = "asking"; bc.product = p; if (state.view === "barcode") render();
      let ai = null;
      try { ai = await askBarcode(code, { demo }); } catch { ai = null; }
      if (state.bc !== bc) return;
      if (ai) { found(ai); rememberProduct(ai); }
      else bc.status = p?.missing ? "nonutrition" : "notfound";
    } else if (offError) { bc.status = "error"; bc.error = offError.message; }
    else bc.status = p?.missing ? "nonutrition" : "notfound";
  } catch (e) { bc.status = "error"; bc.error = e.message; }
  if (state.view === "barcode") render();
}
function renderBarcode() {
  const bc = state.bc || { status: "nocode" };
  const p = bc.product;
  let body = "";
  if (bc.status === "reading") body = `<p>Reading the barcode…</p>`;
  else if (bc.status === "looking") body = `<p>Found code <strong>${esc(bc.code)}</strong>. Looking it up…</p>`;
  else if (bc.status === "asking") body = `<p>It's not in the food database, so Munchkin is searching for <strong>${esc(bc.code)}</strong> online… 🔎</p>`;
  else if (["nocode", "notfound", "nonutrition", "error"].includes(bc.status)) {
    const msg = {
      nocode: "Munchkin couldn't read a barcode in that photo. Try again closer, with the stripes sharp and straight, or type the number under the stripes.",
      notfound: `Munchkin couldn't find this product (${esc(bc.code || "")}) in the food database or online. Snap the nutrition label instead, and Munchkin will read it and remember it for next time.`,
      nonutrition: `Found “${esc(p?.name || bc.code)}”, but the database has no calories for it. Snap the nutrition label instead.`,
      error: esc(bc.error || "Something went wrong."),
    }[bc.status];
    body = `<p>${msg}</p>
      <div class="field"><label for="bc-code">Barcode number</label><input id="bc-code" type="text" inputmode="numeric" value="${esc(bc.code || "")}" placeholder="e.g. 3800123456789"></div>
      <div class="btn-row"><button class="btn" data-action="bc-lookup">Look it up</button>
      <label class="btn ghost">📋 Snap the label instead<input type="file" id="pick-label" accept="image/*" capture="environment" hidden></label></div>`;
  } else if (bc.status === "found") {
    const g = Number(bc.grams) || 0, t = forGrams(p, g);
    const opts = [];
    if (p.packGrams) { opts.push([p.packGrams, `Whole pack (${p.packGrams} g)`]); opts.push([Math.round(p.packGrams / 2), `Half (${Math.round(p.packGrams / 2)} g)`]); }
    if (p.servingGrams) opts.push([p.servingGrams, `1 serving (${p.servingGrams} g)`]);
    opts.push([100, "100 g"]);
    body = `
      <div class="product">
        ${p.image ? `<img src="${esc(p.image)}" alt="">` : ""}
        <div><strong>${esc(p.name)}</strong><span>${esc(p.brand)}${p.packText ? ` · ${esc(p.packText)}` : ""}</span>
        <span>Per 100 g: ${Math.round(p.per100.calories)} kcal · P ${p.per100.protein ?? "?"} g · C ${p.per100.carbs ?? "?"} g · F ${p.per100.fat ?? "?"} g</span></div>
      </div>
      <div class="field"><label>How much did you have?</label>
        <div class="chips">${opts.map(([v, l]) => `<button class="chip" data-action="bc-grams" data-g="${v}" aria-pressed="${g === v}">${l}</button>`).join("")}</div>
      </div>
      <div class="field"><label for="bc-g">Or type grams</label><input id="bc-g" type="number" inputmode="numeric" value="${esc(bc.grams)}"></div>
      <div class="ex-result"><span>${g} g</span><strong id="bc-kcal">${t.calories} kcal</strong></div>
      <div class="chips">${SLOTS.map(([id, label]) => `<button class="chip" data-action="bc-slot" data-slot="${id}" aria-pressed="${bc.slot === id}">${label}</button>`).join("")}</div>
      <div class="btn-row"><button class="btn" data-action="bc-add">Add to diary</button></div>
      <p class="help">${{ saved: "You've had this before, so Munchkin remembered it. 💜", ai: "Munchkin found this online, so double-check it against the label if you can.", off: "From Open Food Facts, a free food database filled in by people. If the numbers look off, compare with the label." }[p.source] || ""}</p>`;
  }
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Barcode</h1>
    </header>
    <section class="card">${body}</section>
  </main>`;
}

// ---------- water ----------
const GLASS = 250;
async function addWater(ml, date) {
  const id = `water-${date}`;
  try {
    let current = date === state.date ? state.meals.find((d) => d.id === id) : null;
    if (!current && store.get) current = await store.get(id).catch(() => null);
    const total = Math.max(0, (current?.ml || 0) + ml);
    await store.save({ id, type: "water", date, ml: total, createdAt: current?.createdAt || Date.now(), updatedAt: Date.now() });
    toast(`💧 +${ml} ml water${date === iso(new Date()) ? "" : `, ${prettyDate(date).toLowerCase()}`}`);
  } catch { toast("Couldn't add the water. Try the + button on the home screen."); }
}
function waterGoal() {
  const kg = Number(state.goals?.profile?.weight);
  return kg ? Math.round((kg * 33) / GLASS) * GLASS : 2000;
}
function waterHTML() {
  const w = state.meals.find((d) => d.type === "water");
  const ml = w?.ml || 0, goal = waterGoal();
  const glasses = Math.max(8, Math.ceil(goal / GLASS));
  const full = Math.round(ml / GLASS);
  return `<section class="water">
    <div class="slot-head"><h2>💧 Water</h2><span class="sum">${(ml / 1000).toFixed(2).replace(/0$/, "")} / ${(goal / 1000).toFixed(1)} L</span></div>
    <div class="glasses">
      <button class="icon-btn" data-action="water" data-d="-1" aria-label="Remove a glass" ${ml ? "" : "disabled"}>−</button>
      <div class="glass-row">${[...Array(glasses)].map((_, i) => `<span class="glass ${i < full ? "full" : ""}"></span>`).join("")}</div>
      <button class="icon-btn add" data-action="water" data-d="1" aria-label="Add a glass (250 ml)">+</button>
    </div>
    <p class="help">One glass = 250 ml. ${state.goals?.profile?.weight ? "Goal from your weight." : "Set your weight in Goals for a personal goal."}</p>
  </section>`;
}

// ---------- steps sent by the Android app ----------
// The Android app opens Munchkin with ?sync=health&date=…&steps=…&active=…
function readHealthLink() {
  const q = new URLSearchParams(location.search);
  if (q.get("sync") !== "health") return;
  const data = { date: q.get("date"), steps: Math.round(Number(q.get("steps")) || 0), active: Math.round(Number(q.get("active")) || 0) };
  try { sessionStorage.setItem("munchkin.health", JSON.stringify(data)); } catch {}
  history.replaceState(null, "", location.pathname + (demo ? "?demo" : ""));
}
async function applyHealthLink() {
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem("munchkin.health") || "null"); sessionStorage.removeItem("munchkin.health"); } catch {}
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || "") || data.date > iso(new Date())) return;
  try {
    await store.save({ id: `steps-${data.date}`, type: "steps", date: data.date, steps: data.steps, active: data.active, source: "Google Fit", createdAt: Date.now(), updatedAt: Date.now() });
    toast(`👣 ${data.steps.toLocaleString()} steps synced from Health Connect`);
  } catch { toast("Couldn't save your steps. Try again."); }
}
readHealthLink();

// ---------- inside the Android app: read steps straight from Health Connect ----------
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const HealthAPI = () => (isNative() ? window.Capacitor.Plugins?.HealthPlugin : null);
const HEALTH_PERMS = ["READ_STEPS", "READ_ACTIVE_CALORIES"];
const EXTRA_PERMS = ["READ_WEIGHT"];
async function syncHealth(ask = false) {
  const H = HealthAPI();
  if (!H || !state.user || !store) return;
  try {
    const av = await H.isHealthAvailable();
    if (!av.available) { state.health = "missing"; if (state.view === "day") render(); return; }
    if (ask) await H.requestHealthPermissions({ permissions: [...HEALTH_PERMS, ...EXTRA_PERMS] });
    const perm = await H.checkHealthPermissions({ permissions: HEALTH_PERMS });
    const ok = perm.permissions && Object.values(perm.permissions).length && Object.values(perm.permissions).every(Boolean);
    if (!ok) { state.health = "ask"; if (state.view === "day") render(); return; }
    state.health = "ok";
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sum = async (dataType) => {
      const r = await H.queryAggregated({ startDate: start.toISOString(), endDate: now.toISOString(), dataType, bucket: "day" });
      return Math.round((r.aggregatedData || []).reduce((n, x) => n + (Number(x.value) || 0), 0));
    };
    syncHealthWeight(H);
    const steps = await sum("steps");
    const active = await sum("active-calories").catch(() => 0);
    const date = iso(now), id = `steps-${date}`;
    const existing = state.date === date ? state.meals.find((d) => d.id === id) : null;
    if (existing && existing.steps === steps) return;
    await store.save({ id, type: "steps", date, steps, active, source: "Google Fit", createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() });
  } catch (e) {
    state.health = "error"; state.healthError = String(e?.message || e).slice(0, 140);
    if (state.view === "day") render();
  }
}
async function syncHealthWeight(H) {
  try {
    const p = await H.checkHealthPermissions({ permissions: EXTRA_PERMS });
    if (!p.permissions || !Object.values(p.permissions).every(Boolean)) return;
    const end = new Date(), start = new Date(end.getTime() - 30 * 86400000);
    const r = await H.queryRecords({ startDate: start.toISOString(), endDate: end.toISOString(), dataType: "weight" });
    const byDay = {};
    for (const rec of r.records || []) { const d = iso(new Date(rec.startDate)); byDay[d] = rec; }
    const have = new Map((state.body?.weights || []).map((e) => [e.date, e]));
    let n = 0;
    for (const [d, rec] of Object.entries(byDay)) {
      const ex = have.get(d);
      if (ex && !ex.source) continue; // a weight typed by hand wins
      const kg = Math.round(Number(rec.value) * 10) / 10;
      if (!kg || (ex && ex.kg === kg)) continue;
      await saveWeight(kg, d, "Health Connect", new Date(rec.startDate).getHours()); n++;
    }
    if (n) loadBody();
  } catch { /* weight is optional */ }
}
if (isNative()) {
  const App = window.Capacitor.Plugins?.App;
  App?.addListener?.("resume", () => { syncHealth(); syncCycle(); });
  // Android back button: go back inside Munchkin, or leave the app from the home screen.
  App?.addListener?.("backButton", () => {
    if (state.view !== "day" || document.querySelector(".viewer:not([hidden])")) history.back();
    else if (state.sheet || state.exSheet) { state.sheet = false; state.exSheet = null; render(); }
    else App.minimizeApp ? App.minimizeApp() : App.exitApp();
  });
}

// ---------- keys on the account (optional) ----------
async function syncKeysUp() {
  const s = loadAISettings();
  if (!s.syncKeys || !store?.saveKeys) return;
  await store.saveKeys({ provider: s.provider, keys: s.keys || {} });
}
async function syncKeysDown() {
  if (!store?.getKeys) return;
  try {
    const remote = await store.getKeys();
    if (!remote?.keys) return;
    const s = loadAISettings();
    s.keys = { ...remote.keys, ...Object.fromEntries(Object.entries(s.keys || {}).filter(([, v]) => v)) };
    if (!hasKey()) s.provider = remote.provider || s.provider;
    s.syncKeys = true;
    saveAISettings(s);
    if (state.view === "day") render();
  } catch { /* stays local */ }
}


// ---------- weight & cycle ----------
// Cycle tracking is switched off for now: Flo doesn't share period days with Health Connect.
// Set this to true to bring back the cycle card, Cycle page, pink bands and the "Track my cycle" switch.
const CYCLE_FEATURE = false;
const cycleOn = () => CYCLE_FEATURE && state.goals?.profile?.sex === "female" && state.goals?.profile?.trackCycle !== false;
async function loadBody() {
  if (!store || !state.user) return;
  const today = iso(new Date());
  try {
    const docs = await store.getRange(shiftDate(today, -400), today);
    const weights = docs.filter((d) => d.type === "weight");
    const period = docs.filter((d) => d.type === "period");
    state.body = {
      weights: weightTrend(weights),
      periodDays: period.map((d) => d.date),
      periodDocs: period,
      manualStarts: period.filter((d) => d.start).map((d) => d.date),
    };
    state.cycle = cycleInfo(state.body.periodDays, state.body.manualStarts);
  } catch { /* keep what we had */ }
  if (["day", "body", "cycle", "calendar"].includes(state.view)) render();
}
function todayPhase() {
  if (!cycleOn() || !state.cycle?.starts?.length) return null;
  return phaseOn(iso(new Date()), state.cycle);
}
// When might you reach your goal weight? Uses your real trend once there are 2+ weeks of weigh-ins,
// otherwise the pace you picked in Goals.
function goalForecast() {
  const prof = state.goals?.profile;
  const target = Number(prof?.goalWeight);
  if (!(target > 30)) return null;
  const w = state.body?.weights || [];
  const last = w[w.length - 1];
  const current = last ? last.trend : Number(prof?.weight);
  if (!(current > 30)) return null;
  const need = target - current;
  const fmtD = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long", ...(new Date(d).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  if (Math.abs(need) < 0.3) return { target, done: true, short: `🎉 You're at your goal of ${target} kg`, text: `🎉 You're at your goal weight of ${target} kg. Amazing, queen!` };
  const recent = w.filter((e) => e.date >= shiftDate(iso(new Date()), -60));
  const span = recent.length >= 4 ? Math.round((new Date(recent[recent.length - 1].date) - new Date(recent[0].date)) / 86400000) : 0;
  // what to trust: 1) your real weight trend, 2) this week's eating, 3) the pace picked in Goals
  let rate, source;
  if (span >= 14 && weeklyChange(w) != null) { rate = weeklyChange(w); source = "trend"; }
  else if (state.week && state.week.days >= 2) { rate = Math.round(state.week.kgWeek * 100) / 100; source = "week"; }
  else { rate = (PACES.find((x) => x[0] === paceOf(prof || {})) || [, , 0])[2]; source = "plan"; }
  const goingRight = rate && Math.sign(rate) === Math.sign(need);
  if (!goingRight) {
    const why = source === "trend"
      ? (Math.abs(rate || 0) < 0.05 ? "Your weight has been steady lately, so there's no date yet." : "Your trend is going the other way right now, so there's no date yet. Water jumps happen; give it a week.")
      : source === "week" ? "At what you ate this week, your weight would stay about the same or go the other way, so there's no date yet."
      : "Pick a pace that goes toward your goal in Goals to see a date.";
    return { target, short: `🎯 Goal ${target} kg`, text: why };
  }
  const days = Math.round((need / rate) * 7);
  if (days > 730) return { target, short: `🎯 ${target} kg: over 2 years at this pace`, text: `At ${Math.abs(rate).toFixed(2)} kg a week, ${target} kg is more than 2 years away.` };
  const date = shiftDate(iso(new Date()), days);
  const pace = `${rate < 0 ? "−" : "+"}${Math.abs(rate).toFixed(2)} kg a week`;
  const basis = { trend: "your weigh-ins", week: "what you ate this week", plan: "your planned pace" }[source];
  return { target, date, rate, source, short: `🎯 ${target} kg around ${fmtD(date)} <span class="goal-basis">· from ${basis}</span>`,
    text: source === "trend"
      ? `Based on your weigh-ins (${pace}), you'll reach ${target} kg around <strong>${fmtD(date)}</strong> 🎯`
      : source === "week"
      ? `Based on what you ate this week (${pace}), you'll reach ${target} kg around <strong>${fmtD(date)}</strong> 🎯 After 2 weeks of weigh-ins, Munchkin uses your real weight trend instead.`
      : `If you keep to your planned pace (${pace}), you'll reach ${target} kg around <strong>${fmtD(date)}</strong> 🎯 Log a few days of food and it switches to what you actually eat.` };
}
function bodyCardHTML() {
  const w = state.body?.weights || [];
  const last = w[w.length - 1];
  const ch = weeklyChange(w);
  const fc = goalForecast();
  const goalLine = fc ? `<small class="goal-line">${fc.short}</small>` : "";
  if (!last) {
    return `<button class="body-card" data-action="body"><span>⚖️</span><span class="bc-main"><strong>Weigh in</strong><small>Track your weight trend</small>${goalLine}</span><span class="bc-go">›</span></button>`;
  }
  return `<button class="body-card" data-action="body">
    <span>⚖️</span>
    <span class="bc-main">
      <strong>${last.kg.toFixed(1)} kg${last.trend !== last.kg ? ` <small>· trend ${last.trend.toFixed(1)}</small>` : ""}</strong>
      <small>${ch != null ? `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${Math.abs(ch).toFixed(1)} kg this week` : `Last weigh-in ${prettyDate(last.date).toLowerCase()}`}</small>
      ${goalLine}
    </span><span class="bc-go">›</span></button>`;
}
function cycleCardHTML() {
  if (!cycleOn()) return "";
  const ph = state.cycle?.starts?.length ? phaseOn(state.date, state.cycle) : null;
  if (!ph) return `<button class="body-card cycle" data-action="cycle"><span>🌙</span>
    <span class="bc-main"><strong>Cycle</strong><small>Tap to start tracking your cycle</small></span><span class="bc-go">›</span></button>`;
  const when = ph.phase === "late" ? "Period later than expected"
    : ph.phase === "period" ? `Day ${ph.day}`
    : ph.daysToNext > 0 ? `Day ${ph.day} · period in about ${ph.daysToNext} day${ph.daysToNext === 1 ? "" : "s"}` : `Day ${ph.day} · period due about now`;
  return `<button class="body-card cycle" data-action="cycle"><span>${PHASE[ph.phase].emoji}</span>
    <span class="bc-main"><strong>${PHASE[ph.phase].name} <small>· ${when}</small></strong><span class="cycle-note">${esc(dayNote(ph, state.cycle))}</span></span><span class="bc-go">›</span></button>`;
}
function weightChartSVG(points, marks, from, to, proj = null) {
  const W = 340, H = 170, pl = 34, pr = 10, pt = 10, pb = 22;
  // a dotted path toward the goal weight (shown up to 8 weeks ahead)
  let pend = null;
  if (proj && points.length) {
    const last = points[points.length - 1];
    const maxTo = shiftDate(to, 56);
    const endDate = proj.date < maxTo ? proj.date : maxTo;
    const total = (new Date(proj.date) - new Date(last.date)) / 86400000 || 1;
    const part = (new Date(endDate) - new Date(last.date)) / 86400000;
    pend = { from: last, date: endDate, kg: last.trend + (proj.target - last.trend) * Math.min(1, part / total), reached: endDate === proj.date, target: proj.target };
    to = endDate;
  }
  const span = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
  const x = (d) => pl + ((new Date(d) - new Date(from)) / 86400000 / span) * (W - pl - pr);
  if (!points.length) return "";
  const vals = points.flatMap((p) => [p.kg, p.trend]).concat(pend ? [pend.kg] : []);
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) { hi += 1; lo -= 1; }
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const bands = Object.entries(marks).map(([d, k]) => `<rect x="${x(d) - 2}" y="${pt}" width="${Math.max(3, (W - pl - pr) / span)}" height="${H - pt - pb}" class="band ${k}"/>`).join("");
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(v % 1 ? 1 : 0)}</text><line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`).join("");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.trend).toFixed(1)}`).join(" ");
  const dots = points.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" class="dot"/>`).join("");
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const projSVG = pend ? `<path d="M${x(pend.from.date).toFixed(1)} ${y(pend.from.trend).toFixed(1)} L${x(pend.date).toFixed(1)} ${y(pend.kg).toFixed(1)}" class="proj"/>${pend.reached ? `<text x="${(x(pend.date) - 4).toFixed(1)}" y="${(y(pend.kg) - 8).toFixed(1)}" text-anchor="end" class="goal-flag">🎯 ${pend.target}</text>` : ""}` : "";
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart">
    ${bands}${ticks}${projSVG}<path d="${line}" class="trend"/>${dots}
    <text x="${pl}" y="${H - 6}">${fmt(from)}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${fmt(to)}</text></svg>`;
}
function renderBody() {
  const today = iso(new Date());
  const w = state.body?.weights || [];
  const last = w[w.length - 1];
  const ch = weeklyChange(w);
  const from = shiftDate(today, -44);
  const pts = w.filter((p) => p.date >= from);
  const marks = cycleOn() && state.cycle ? periodMarks(state.cycle, from, today) : {};
  const prof = state.goals?.profile;
  const fc = goalForecast();
  const goalW = Number(prof?.weight);
  const suggestUpdate = last && goalW && Math.abs(last.trend - goalW) >= 1;
  const showTip = last && last.date === today && last.hour != null && last.hour >= 11;
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Weight</h1>
    </header>
    <section class="card">
      <h2>Weigh in</h2>
      <div class="field-row two">
        <div class="field"><label for="w-kg">Weight (kg)</label><input id="w-kg" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 66.7"></div>
        <div class="field"><label for="w-date">Day</label><input id="w-date" type="date" value="${today}" max="${today}"></div>
      </div>
      <div class="btn-row"><button class="btn" data-action="save-weight">Save</button></div>
      <p class="help">Morning weigh-ins compare best: after the toilet, before eating or drinking, same scale.</p>
      ${showTip ? `<p class="help tip">Today's weigh-in was later in the day, so it may read 0.5–1.5 kg higher from food and drinks.</p>` : ""}
    </section>
    <section class="card">
      <h2>Your trend</h2>
      ${last ? `<div class="wstats"><div><strong>${last.trend.toFixed(1)} kg</strong><small>trend</small></div><div><strong>${ch == null ? "—" : `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${Math.abs(ch).toFixed(1)} kg`}</strong><small>per week</small></div><div><strong>${last.kg.toFixed(1)} kg</strong><small>last weigh-in</small></div></div>
      ${weightChartSVG(pts, marks, from, today, fc?.date ? fc : null)}
      ${fc ? `<p class="goal-forecast">${fc.text}</p>` : `<p class="help">Set a goal weight in Goals to see when you might reach it.</p>`}
      <p class="help">Dots are your weigh-ins; the line is your trend, which ignores day-to-day water jumps.${cycleOn() ? ` Pink bands are period days (lighter = predicted). <button class="link-btn inline" data-action="cycle">See your cycle ›</button>` : ""}</p>
      ${suggestUpdate ? `<div class="notice soft"><p>Your daily calories and protein are still worked out for <strong>${goalW} kg</strong>. Your weigh-ins now say about <strong>${last.trend.toFixed(1)} kg</strong>.</p><p class="help">Updating gives you slightly ${last.trend < goalW ? "lower" : "higher"} targets (never under ${safeMinimum(prof)} kcal). Numbers you typed yourself stay. Tip: wait for a week of weigh-ins so water jumps don't fool it.</p><div class="btn-row"><button class="btn ghost small" data-action="weight-goals">Update my goals to ${last.trend.toFixed(1)} kg</button></div></div>` : ""}
      <ul class="wlist">${[...w].reverse().slice(0, 8).map((e) => `<li><span>${prettyDate(e.date)}${e.source ? ` <em>${esc(e.source)}</em>` : ""}</span><span>${e.kg.toFixed(1)} kg <button class="link-btn" data-action="del-weight" data-date="${e.date}" aria-label="Delete">✕</button></span></li>`).join("")}</ul>`
      : `<p>No weigh-ins yet. Add your first one above.</p>`}
    </section>
  </main>`;
}
function renderCycle() {
  const today = iso(new Date());
  const ph = todayPhase();
  const c = state.cycle;
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Cycle</h1>
    </header>
    <section class="card">
      ${ph ? `<p class="phase"><span>${PHASE[ph.phase].emoji}</span><span><strong>${PHASE[ph.phase].name} · day ${ph.day}</strong><small>${esc(dayNote(ph, c))}</small><small>${PHASE[ph.phase].text(ph)}</small></span></p>
        <p class="help">Next period expected around <strong>${new Date(ph.next).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</strong> · cycle about ${c.cycleLen} days${c.learned ? " (learned from your periods)" : " (a typical guess until Munchkin has seen 2 periods)"}.</p>`
      : `<p>Munchkin doesn't know your cycle yet. Tap below when your period starts${isNative() ? ", or connect your period tracker further down" : ""}.</p>`}
      ${state.periodJustSaved ? `<div class="notice soft undo-row"><p>🩸 Saved: period started ${state.periodJustSaved === today ? "today" : fmtDay(state.periodJustSaved)}.</p><button class="btn ghost small" data-action="del-period" data-id="period-${state.periodJustSaved}">Undo</button></div>`
        : `<div class="btn-row"><button class="btn" data-action="period-start">🩸 My period started today</button></div>`}
      <details class="ex-other"><summary>Started on another day?</summary>
        <div class="field-row two"><div class="field"><input id="p-date" type="date" max="${today}" value="${today}"></div><div class="btn-row"><button class="btn small" data-action="period-start-on">Save</button></div></div>
      </details>
    </section>
    ${loggedPeriodsHTML()}
    <section class="card">
      <h2>Period tracker app</h2>
      ${cycleStatusHTML()}
      <p class="help">Munchkin reads from any tracker app that shares with Health Connect (like Flo). Your cycle stays private in your own diary.</p>
    </section>
    <section class="card">
      <h2>Why your weight moves</h2>
      <p class="help">Your body holds more water in the days before your period, often 0.5–2 kg. That's not fat, and it usually goes a few days after your period starts. Your weight chart shows period days as pink bands so you can spot this.</p>
      <div class="btn-row"><button class="btn ghost small" data-action="body">See your weight ›</button></div>
    </section>
  </main>`;
}
const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long" });
function loggedPeriodsHTML() {
  const docs = state.body?.periodDocs || [];
  const mine = docs.filter((d) => !d.source).sort((a, b) => b.date.localeCompare(a.date));
  const fromHC = docs.length - mine.length;
  if (!mine.length && !fromHC) return "";
  return `<section class="card">
    <h2>Your logged periods</h2>
    ${mine.length ? `<ul class="wlist">${mine.slice(0, 12).map((d) => `<li><span>🩸 Started ${fmtDay(d.date)}</span><button class="link-btn" data-action="del-period" data-id="${esc(d.id)}" aria-label="Delete ${fmtDay(d.date)}">✕ Delete</button></li>`).join("")}</ul>` : ""}
    ${fromHC ? `<p class="help">Plus ${fromHC} day${fromHC === 1 ? "" : "s"} from your tracker app. Change those in the tracker itself.</p>` : ""}
    <p class="help">Tapped by mistake? Delete it here and Munchkin works out your cycle again.</p>
  </section>`;
}
function cycleStatusHTML() {
  if (!isNative()) return `<p>Connecting your tracker works in the Munchkin Android app. Here you can still tap when your period starts.</p>`;
  const st = state.cycleConn || { kind: "checking" };
  const hcBtn = `<button class="btn small" data-action="hc-settings">Open Health Connect</button>`;
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  if (st.kind === "checking") return `<p class="conn">⏳ Checking the connection…</p>`;
  if (st.kind === "asking") return `<p class="conn">⏳ Asking for permission…</p>`;
  if (st.kind === "old-app") return `<div class="notice"><strong>Update the Android app first</strong><p>Your Munchkin app is an older version that can't read period trackers yet.</p><div class="btn-row"><a class="btn small" href="https://github.com/dstephanova/munchkin/releases/latest/download/munchkin.apk">Download the new version</a></div></div>`;
  if (st.kind === "no-hc") return `<div class="notice"><strong>Health Connect isn't on this phone</strong><p>Install it from the Play Store, then try again. Until then, use the button above.</p><div class="btn-row"><button class="btn small" data-action="health-store">Get Health Connect</button></div></div>`;
  if (st.kind === "not-connected") return `<p class="conn off">○ Not connected yet</p><div class="btn-row"><button class="btn" data-action="cycle-connect">Connect my period tracker</button></div>`;
  if (st.kind === "no-permission") return `<p class="conn off">✕ Not connected</p><div class="notice"><strong>Munchkin isn't allowed to read your cycle yet</strong><p>Open Health Connect → App permissions → Munchkin, and turn on <strong>Menstruation</strong>.</p><div class="btn-row">${hcBtn}<button class="btn ghost small" data-action="cycle-connect">Try again</button></div></div>`;
  if (st.kind === "error") return `<p class="conn off">✕ Something went wrong</p><p class="help">${esc(st.msg)}</p><div class="btn-row"><button class="btn ghost small" data-action="cycle-connect">Try again</button></div>`;
  // connected
  if (!st.total) return `<p class="conn on">✓ Connected · <span class="conn-warn">your tracker isn't sharing period days yet</span></p>
    <details class="ex-other"><summary>How to fix</summary>
      <p class="help">Open Health Connect, tap <strong>App permissions</strong>, find <strong>Flo</strong> (or your tracker) and turn on <strong>Menstruation</strong>. If your tracker isn't listed, look in its own settings for “Health Connect”. If it isn't there either, your tracker doesn't share on Android, so just tap “My period started” here instead.</p>
      <div class="btn-row">${hcBtn}<button class="btn ghost small" data-action="cycle-connect">Check again</button></div>
    </details>`;
  return `<p class="conn on">✓ Connected · ${st.total} period day${st.total === 1 ? "" : "s"} found${st.latest ? `, latest ${fmt(st.latest)}` : ""}</p>`;
}
async function saveWeight(kg, date, source = "", hour = null) {
  await store.save({ id: `weight-${date}`, type: "weight", date, kg: Math.round(kg * 10) / 10, hour, source, createdAt: Date.now(), updatedAt: Date.now() });
}
async function syncCycle(ask = false) {
  const C = isNative() && window.Capacitor.Plugins?.Cycle;
  if (!cycleOn() || !store || !state.user) return;
  const show = (conn) => { state.cycleConn = conn; if (state.view === "cycle") render(); };
  if (!C) { if (isNative()) show({ kind: "old-app" }); return; }
  try {
    let st = await C.status();
    if (!st.available) return show({ kind: "no-hc" });
    if (!st.granted && ask) {
      show({ kind: "asking" });
      st = { granted: (await C.requestAccess()).granted };
    }
    if (!st.granted) return show({ kind: ask ? "no-permission" : "not-connected" });
    const end = new Date(), start = new Date(end.getTime() - 400 * 86400000);
    const r = await C.readPeriods({ startDate: start.toISOString(), endDate: end.toISOString() });
    const days = (r.days || []).slice().sort();
    const have = new Set(state.body?.periodDays || []);
    const fresh = days.filter((d) => !have.has(d));
    for (const d of fresh) await store.save({ id: `period-${d}`, type: "period", date: d, source: "Health Connect", createdAt: Date.now(), updatedAt: Date.now() });
    state.cycleConn = { kind: "connected", total: days.length, latest: days[days.length - 1] || null, fresh: fresh.length };
    if (fresh.length) await loadBody();
  } catch (e) { state.cycleConn = { kind: "error", msg: "Couldn't read your period data: " + String(e?.message || e).slice(0, 100) }; }
  if (state.view === "cycle") render();
}

// ---------- calendar ----------
async function openCalendar() {
  const d = fromIso(state.date);
  state.cal = { year: d.getFullYear(), month: d.getMonth(), days: null };
  go("calendar");
  loadCalendarMonth();
}
async function loadCalendarMonth() {
  const c = state.cal;
  const start = iso(new Date(c.year, c.month, 1)), end = iso(new Date(c.year, c.month + 1, 0));
  c.days = null;
  try {
    const meals = await store.getRange(start, end);
    if (state.cal !== c || state.view !== "calendar") return;
    const days = {};
    const byDay = {};
    for (const m of meals) (byDay[m.date] ||= []).push(m);
    for (const [date, list] of Object.entries(byDay)) {
      const food = list.filter(isMealDoc);
      if (!food.length) continue;
      days[date] = { calories: sumItems(food.flatMap((m) => m.items || [])).calories, meals: food.length, burned: dayBurn(list).total };
    }
    c.weights = Object.fromEntries(meals.filter((m) => m.type === "weight").map((m) => [m.date, m.kg]));
    const lastDay = iso(new Date(c.year, c.month + 1, 0));
    c.marks = cycleOn() && state.cycle ? periodMarks(state.cycle, start, lastDay) : {};
    c.days = days;
  } catch {
    c.days = {};
    toast("Couldn't load this month. Check your internet.");
  }
  if (state.view === "calendar") render();
}
function renderCalendar() {
  const c = state.cal;
  const first = new Date(c.year, c.month, 1);
  const daysInMonth = new Date(c.year, c.month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const today = iso(new Date());
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdays = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
  const isThisMonth = c.year === new Date().getFullYear() && c.month === new Date().getMonth();
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-cell empty"></span>`;
  let logged = 0, total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = iso(new Date(c.year, c.month, day));
    const info = c.days?.[key];
    const future = key > today && !(c.marks?.[key] === "predicted");
    if (info) { logged++; total += info.calories; }
    const goal = goalsOn(key)?.calories || 0;
    const dayGoal = goal + (info?.burned || 0);
    const status = !info ? "" : goal ? (info.calories > dayGoal * 1.05 ? "over" : info.calories >= dayGoal * 0.85 ? "near" : "under") : "logged";
    cells += `<button class="cal-cell ${status} ${key === today ? "today" : ""} ${key === state.date ? "picked" : ""}" data-action="cal-day" data-date="${key}" ${future ? "disabled" : ""}>
      <span class="num">${day}</span>${info ? `<span class="ck">${info.calories}</span>` : ""}${c.weights?.[key] ? `<span class="cw">⚖️${Number(c.weights[key]).toFixed(1)}</span>` : ""}${c.marks?.[key] ? `<i class="pdot ${c.marks[key]}"></i>` : ""}</button>`;
  }
  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>
      <h1>Calendar</h1>
    </header>
    <section class="card cal">
      <div class="cal-head">
        <button class="icon-btn" data-action="cal-month" data-step="-1" aria-label="Previous month">${ICON.back}</button>
        <strong>${title}</strong>
        <button class="icon-btn" data-action="cal-month" data-step="1" aria-label="Next month" ${isThisMonth ? "disabled" : ""}>${ICON.next}</button>
      </div>
      <div class="cal-grid">${weekdays.map((w) => `<span class="cal-wd">${w}</span>`).join("")}${cells}</div>
      ${c.days === null ? `<p class="empty-note">Loading…</p>` : `<p>${logged ? `${logged} day${logged > 1 ? "s" : ""} logged · average ${Math.round(total / logged)} kcal a day` : "Nothing logged this month yet."}</p>`}
      ${state.goals ? `<div class="cal-legend"><span><i class="near"></i>Around your goal</span><span><i class="under"></i>Under</span><span><i class="over"></i>Over</span></div>` : ""}
    </section>
  </main>`;
}

function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
}
function scrollToEnd() {
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
}

// ---------- navigation ----------
function go(view) {
  if (view === "day") {
    state.view = "day";
    state.meal = null;
    state.error = null;
    state.confirmDelete = false;
    state.composer = "";
    state.sending = false;
    state.pendingPhotos = [];
    render();
    rememberOpen();
    return;
  }
  history.pushState({ view }, "");
  state.view = view;
  window.scrollTo(0, 0);
  render();
}
function back() {
  if (history.state && history.state.view) history.back();
  else go("day");
}
window.addEventListener("popstate", () => {
  if (["meal", "settings", "goals", "calendar", "barcode", "body", "cycle", "manual"].includes(state.view)) {
    state.settingsStatus = null;
    go("day");
  }
});

function watchDay() {
  if (unsubDay) unsubDay();
  unsubDay = store.watchDay(state.date, (meals) => {
    state.meals = meals;
    if (state.view === "day") render();
    refreshWeek();
  }, () => toast("Couldn't load your diary. Check your internet."));
}

// ---------- meals ----------
async function readPhoto(file, max = 768) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function newMeal(photo) {
  return {
    id: store.newId(), date: state.date, slot: state.sheetSlot, name: "New meal",
    items: [], photo: photo || null, chat: [], createdAt: Date.now(), updatedAt: Date.now(), _draft: true,
  };
}

async function saveMeal(m) {
  const { _draft, _retried, waterOnly, ...clean } = m;
  if (_draft && clean.items?.length) pendingMood = "munch";
  clean.totals = sumItems(clean.items);
  clean.updatedAt = Date.now();
  await store.save(clean);
  m._draft = false;
}

function sendMessage(text) {
  const m = state.meal;
  if (!m || state.sending) return;
  const photos = state.pendingPhotos || [];
  if (!text && !photos.length && !(m.chat.length === 0 && m.photo)) return;
  const turn = { role: "user", text: text || "" };
  if (photos.length) {
    turn.photos = photos;
    if (!m.photo) { m.photo = photos[0]; m.photoFromChat = true; } // first one is also the meal's picture
  }
  m.chat.push(turn);
  state.composer = "";
  state.pendingPhotos = [];
  runAI();
  rememberOpen();
}

// Photos added inside the chat: camera/gallery button or paste (Ctrl+V).
function mealPhotos(m) {
  if (!m) return [];
  return [m.photo, ...(m.chat || []).flatMap((c) => [c.photo, ...(c.photos || [])])].filter((x, i, arr) => x && arr.indexOf(x) === i);
}
const PHOTO_LIMIT = 8;
async function addChatPhoto(files) {
  if (!state.meal) return;
  state.pendingPhotos = state.pendingPhotos || [];
  for (const file of files) {
    if (!file) continue;
    if (mealPhotos(state.meal).length + state.pendingPhotos.length >= PHOTO_LIMIT) {
      toast(`That's the photo limit for one meal (${PHOTO_LIMIT}).`); break;
    }
    try { state.pendingPhotos.push(await readPhoto(file, 640)); }
    catch { toast("Couldn't open one of those photos."); }
  }
  const ta = document.getElementById("composer");
  if (ta) state.composer = ta.value;
  render(); scrollToEnd();
  document.getElementById("composer")?.focus();
}
document.addEventListener("paste", (ev) => {
  if (state.view !== "meal") return;
  const items = [...(ev.clipboardData?.items || [])].filter((it) => it.type.startsWith("image/"));
  if (!items.length) return;
  ev.preventDefault();
  addChatPhoto(items.map((it) => it.getAsFile()));
});

// "Just add it for dinner", "move this to yesterday": the AI tells us, the app does it.
function resolveDay(day) {
  const today = iso(new Date());
  if (!day || day === "today") return today;
  if (day === "yesterday") return shiftDate(today, -1);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today;
}
async function applyAction(m, act) {
  const slot = act.slot || m.slot || defaultSlot();
  const date = act.day ? resolveDay(act.day) : (m.askOnly ? iso(new Date()) : m.date);
  if (m.askOnly) {
    if (!act.add) return;
    if (!m.items.length) { toast("Nothing to add yet. Ask about a food first."); return; }
    m.askOnly = false; m.slot = slot; m.date = date; m.createdAt = Date.now();
    if (state.askMeal === m) state.askMeal = null;
    try { await saveMeal(m); toast(`Added to ${SLOT_NAME[slot].toLowerCase()}${date === iso(new Date()) ? " today" : `, ${prettyDate(date).toLowerCase()}`} 🐱`); }
    catch { toast("Couldn't save. Try again."); }
  } else {
    const moved = slot !== m.slot || date !== m.date;
    m.slot = slot; m.date = date;
    if (moved) toast(`Moved to ${SLOT_NAME[slot].toLowerCase()}, ${prettyDate(date).toLowerCase()}`);
  }
  if (state.meal === m) render();
}

// ---------- inside the Android app: the camera buttons use the real camera ----------
const CAMERA_INPUTS = ["pick-camera", "pick-chat-camera", "pick-label", "pick-barcode"];
const CAM_KEY = "munchkin.cam";
let restoredPhoto = null;
function clearCam() { state.camPending = false; try { localStorage.removeItem(CAM_KEY); } catch {} }
async function feedPhoto(input, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], "camera.jpg", { type: blob.type || "image/jpeg" });
  const dt = new DataTransfer(); dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
// Munchkin was closed while the camera was open: Android hands the photo over when it starts again.
if (isNative()) {
  window.Capacitor.Plugins?.App?.addListener?.("appRestoredResult", (r) => {
    if (r?.pluginId !== "Camera" || !r.success || !r.data?.dataUrl) { clearCam(); return; }
    restoredPhoto = r.data.dataUrl;
    deliverRestoredPhoto();
  });
}
function deliverRestoredPhoto() {
  if (!restoredPhoto || !state.user || !store) return;
  let cam = null;
  try { cam = JSON.parse(localStorage.getItem(CAM_KEY) || "null"); } catch {}
  let id = cam?.id || "pick-camera";
  if (id === "pick-chat-camera" && state.view !== "meal") id = "pick-camera";
  if (cam?.slot != null) state.sheetSlot = cam.slot;
  const url = restoredPhoto; restoredPhoto = null; clearCam();
  const input = document.createElement("input");
  input.type = "file"; input.id = id; input.hidden = true;
  $app.appendChild(input);
  feedPhoto(input, url).finally(() => input.remove());
}
document.addEventListener("click", async (ev) => {
  const Cam = isNative() && window.Capacitor.Plugins?.Camera;
  if (!Cam) return;
  const label = ev.target.closest("label");
  const input = label?.querySelector("input[type=file]") || (ev.target.matches?.("input[type=file]") ? ev.target : null);
  if (!input || !CAMERA_INPUTS.includes(input.id)) return;
  ev.preventDefault(); ev.stopPropagation();
  // The phone may close Munchkin while the camera is open (to save memory).
  // Remember what the photo was for, so it still lands in the right place when Munchkin reopens.
  try { localStorage.setItem(CAM_KEY, JSON.stringify({ id: input.id, slot: state.sheetSlot ?? null, at: Date.now() })); } catch {}
  state.camPending = true; rememberOpen();
  try {
    const photo = await Cam.getPhoto({ source: "CAMERA", resultType: "dataUrl", quality: 85, width: 1800, correctOrientation: true, saveToGallery: false });
    clearCam();
    if (!photo?.dataUrl) return;
    await feedPhoto(input, photo.dataUrl);
  } catch (e) {
    clearCam();
    if (!/cancel/i.test(String(e?.message || e))) toast("Couldn't open the camera. Check that Munchkin may use it in your phone's settings.");
  }
}, true);

// ---------- remembering open chats (survives the phone closing Munchkin in the background) ----------
const OPEN_KEY = "munchkin.open";
const lastIsUser = (m) => m?.chat?.length && m.chat[m.chat.length - 1].role === "user";
function rememberOpen() {
  try {
    const m = state.view === "meal" ? state.meal : null;
    const keepMeal = m && (m._draft || m.askOnly || lastIsUser(m) || state.camPending);
    localStorage.setItem(OPEN_KEY, JSON.stringify({
      at: Date.now(),
      uid: state.user?.uid || null,
      askMeal: state.askMeal || null,
      meal: keepMeal ? m : null,
      composer: keepMeal ? state.composer : "",
    }));
  } catch { /* storage full or blocked: nothing to do */ }
}
function restoreOpen() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(OPEN_KEY) || "null"); } catch {}
  if (!data || data.uid !== state.user?.uid || Date.now() - data.at > 24 * 3600 * 1000) return;
  if (data.askMeal && !state.askMeal) state.askMeal = data.askMeal;
  const m = data.meal;
  if (!m) return;
  state.meal = m.askOnly && state.askMeal && state.askMeal.id === m.id ? state.askMeal : m;
  state.composer = data.composer || "";
  state.error = null; state.pendingPhotos = [];
  go("meal");
  if (lastIsUser(state.meal)) {
    // The question never got its answer because Munchkin was closed: ask again.
    toast("Your question got interrupted. Asking again…");
    runAI();
  }
}

// One message about several meals ("pizza for dinner and a mousse as a snack"): each gets its own entry.
async function addOtherMeals(m, others, lastTurn) {
  const added = [];
  for (const o of others) {
    const date = o.day ? resolveDay(o.day) : m.date;
    const meal = { id: store.newId(), date, slot: o.slot, name: o.name, items: o.items, photo: null,
      chat: [{ role: "user", text: lastTurn?.text || "" }, { role: "model", text: `Split from your message about ${m.name}. Fix anything here.` }],
      createdAt: Date.now(), updatedAt: Date.now() };
    try { await saveMeal(meal); added.push(`${o.name} → ${SLOT_NAME[o.slot].toLowerCase()}`); } catch {}
  }
  if (added.length) toast(`Also added: ${added.join(", ")} 🐱`);
}

async function runAI() {
  const m = state.meal;
  state.leftWhileSending = false;
  if (!demo && !hasKey()) {
    state.error = { text: "Munchkin needs an AI key before it can guess food. Add one in Settings (Gemini's is free).", settings: true, retry: false };
    render(); scrollToEnd();
    return;
  }
  state.error = null;
  state.sending = true;
  state.aiStart = Date.now(); state.aiStatus = "Thinking…";
  render(); scrollToEnd(); setAIStatus("Thinking…");
  try {
    const turns = m.chat.slice(-24);
    const res = await askAI(turns, m.chat.length <= 24 && !m.photoFromChat ? m.photo : null, { demo, onStatus: setAIStatus, meal: { name: m.name, items: m.items, slot: m.slot, askOnly: !!m.askOnly } });
    stopAIStatus();
    m.chat.push({ role: "model", text: res.reply, sources: res.sources || [], questions: res.questions || [] });
    state.answers = {};
    m.estimate = !!res.estimate;
    if (res.countFailed) toast("Couldn't update the numbers this time. Send a message to try again.");
    const prevItems = m.items;
    m.name = res.name;
    m.items = res.items;
    // Plain water only: don't turn an empty chat into a food entry.
    if (res.water?.only && !prevItems.length && !res.items.length) m.waterOnly = true;
    state.sending = false;
    if (res.action) await applyAction(m, res.action);
    if (res.others?.length && !m.askOnly) await addOtherMeals(m, res.others, turns[turns.length - 1]);
    if (m.barcode && res.label) rememberProduct({ code: m.barcode, name: res.label.product || res.name, per100: res.label.per100, packGrams: res.label.packGrams, packText: res.label.packGrams ? `${res.label.packGrams} g` : "", source: "label" });
    if (res.water) await addWater(res.water.ml, res.action?.day ? resolveDay(res.action.day) : (m.askOnly ? iso(new Date()) : m.date));
    m._retried = false;
    if (state.meal === m) { render(); scrollToEnd(); }
    if (!m.askOnly && !(m.waterOnly && !m.items.length)) { try { await saveMeal(m); } catch { toast("Couldn't save. It will retry when you're online."); } }
    rememberOpen();
  } catch (e) {
    stopAIStatus();
    state.sending = false;
    if (state.meal !== m) return;
    const interrupted = (state.leftWhileSending || document.hidden) && !["key", "nokey", "credit"].includes(e.kind);
    if (interrupted && !m._retried) {
      m._retried = true;
      if (document.hidden) {
        state.retryOnReturn = m;
        state.error = { text: "Your question got interrupted when you left Munchkin. It will ask again when you're back.", retry: true };
        render(); rememberOpen();
      } else {
        toast("Your question got interrupted. Asking again…");
        runAI();
      }
      return;
    }
    state.error = {
      text: e.message || "Something went wrong.",
      retry: e.kind !== "key" && e.kind !== "nokey",
      settings: e.kind === "key" || e.kind === "nokey",
    };
    if (state.meal === m) { render(); scrollToEnd(); }
    rememberOpen();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.sending) state.leftWhileSending = true;
    rememberOpen();
  } else if (state.retryOnReturn && state.meal === state.retryOnReturn && !state.sending) {
    state.retryOnReturn = null;
    runAI();
  }
});
window.addEventListener("pagehide", rememberOpen);

// ---------- events ----------
$app.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  if ((el.dataset.action === "close-sheet" || el.dataset.action === "close-ex") && el.classList.contains("sheet-backdrop") && ev.target.closest("[data-stop]")) return;
  const a = el.dataset.action;

  if (a === "signin") {
    state.loginError = "";
    try { await store.signIn(); } catch (e) { state.loginError = e.message; render(); }
  } else if (a === "body") {
    go("body"); loadBody();
  } else if (a === "cycle") {
    state.periodJustSaved = null; go("cycle"); loadBody(); syncCycle();
  } else if (a === "save-weight") {
    const kg = Number(String(document.getElementById("w-kg")?.value || "").replace(",", "."));
    const date = document.getElementById("w-date")?.value || iso(new Date());
    if (!(kg > 25 && kg < 350)) { toast("Type your weight in kg, e.g. 66.7"); return; }
    try { await saveWeight(kg, date, "", date === iso(new Date()) ? new Date().getHours() : null); toast(`⚖️ ${kg.toFixed(1)} kg saved`); await loadBody(); }
    catch { toast("Couldn't save. Try again."); }
  } else if (a === "del-weight") {
    try { await store.remove(`weight-${el.dataset.date}`); await loadBody(); } catch { toast("Couldn't delete. Try again."); }
  } else if (a === "weight-goals") {
    const g = state.goals, last = state.body.weights[state.body.weights.length - 1];
    const profile = { ...g.profile, weight: last.trend };
    const sug = suggestGoals(profile);
    const edited = new Set(g.edited || []);
    const next = { ...g, profile, maintenance: sug?.maintenance || g.maintenance, updatedAt: Date.now() };
    if (sug) for (const k of ["calories", "protein", "carbs", "fat"]) if (!edited.has(k)) next[k] = sug[k];
    try { await saveGoalsKeepingHistory(next); toast(`Goals updated for ${last.trend.toFixed(1)} kg`); } catch { toast("Couldn't save. Try again."); }
  } else if (a === "period-start" || a === "period-start-on") {
    const d = a === "period-start" ? iso(new Date()) : (document.getElementById("p-date")?.value || iso(new Date()));
    try { await store.save({ id: `period-${d}`, type: "period", date: d, start: true, source: "", createdAt: Date.now(), updatedAt: Date.now() }); state.periodJustSaved = d; await loadBody(); }
    catch { toast("Couldn't save. Try again."); }
  } else if (a === "del-period") {
    try { await store.remove(el.dataset.id); state.periodJustSaved = null; toast("Deleted"); await loadBody(); }
    catch { toast("Couldn't delete. Try again."); }
  } else if (a === "cycle-connect") {
    await syncCycle(true); render();
  } else if (a === "hc-settings") {
    try { await HealthAPI()?.openHealthConnectSettings(); } catch { toast("Couldn't open Health Connect. Find it in your phone's Settings."); }
  } else if (a === "health-connect") {
    await syncHealth(true);
  } else if (a === "health-store") {
    try { await HealthAPI()?.showHealthConnectInPlayStore(); } catch {}
  } else if (a === "water") {
    const w = state.meals.find((d) => d.type === "water");
    const ml = Math.max(0, (w?.ml || 0) + Number(el.dataset.d) * GLASS);
    try { await store.save({ id: `water-${state.date}`, type: "water", date: state.date, ml, createdAt: w?.createdAt || Date.now(), updatedAt: Date.now() }); }
    catch { toast("Couldn't save. Try again."); }
  } else if (a === "ask") {
    state.sheet = false;
    if (!state.askMeal) { state.askMeal = newMeal(null); state.askMeal.askOnly = true; state.askMeal.slot = defaultSlot(); }
    state.meal = state.askMeal;
    state.error = null; state.composer = ""; state.pendingPhotos = [];
    go("meal");
    document.getElementById("composer")?.focus();
  } else if (a === "ask-new") {
    state.askMeal = newMeal(null); state.askMeal.askOnly = true; state.askMeal.slot = defaultSlot();
    state.meal = state.askMeal; state.error = null; state.composer = ""; render();
  } else if (a === "ask-add") {
    const m = state.meal;
    m.askOnly = false; m.date = iso(new Date()); m.createdAt = Date.now();
    state.askMeal = null;
    try { await saveMeal(m); toast(`Added to ${SLOT_NAME[m.slot].toLowerCase()} today 🐱`); } catch { toast("Couldn't save. Try again."); }
    render();
  } else if (a === "bc-lookup") {
    const code = (document.getElementById("bc-code")?.value || "").replace(/\D/g, "");
    if (code.length < 6) { toast("Type the numbers under the barcode."); return; }
    findBarcode(code);
  } else if (a === "bc-grams") {
    state.bc.grams = Number(el.dataset.g); render();
  } else if (a === "bc-slot") {
    state.bc.slot = el.dataset.slot; const g = document.getElementById("bc-g"); if (g) state.bc.grams = g.value; render();
  } else if (a === "bc-add") {
    const bc = state.bc, p = bc.product, g = Math.round(Number(document.getElementById("bc-g")?.value) || bc.grams || 0);
    if (!g) { toast("How many grams did you have?"); return; }
    const t = forGrams(p, g);
    const name = [p.brand, p.name].filter(Boolean).join(" ").slice(0, 60);
    const meal = { id: store.newId(), date: state.date, slot: bc.slot || defaultSlot(), name, photo: p.image || null,
      items: [{ name: p.name.slice(0, 60), amount: `${g} g`, ...t }],
      chat: [{ role: "user", text: `Scanned barcode ${p.code}: ${g} g` },
             { role: "model", text: `From the food database: **${name}**, ${g} g = ${t.calories} kcal (protein ${t.protein} g, carbs ${t.carbs} g, fat ${t.fat} g). Tell me if you want to change anything.` }],
      createdAt: Date.now(), updatedAt: Date.now() };
    try { await saveMeal(meal); pendingMood = "munch"; toast(`Added ${t.calories} kcal 🐱`); } catch { toast("Couldn't save. Try again."); return; }
    state.bc = null; back();
  } else if (a === "open-ex") {
    state.exSheet = { kind: "walk", minutes: 30, effort: "moderate" }; render();
  } else if (a === "close-ex") {
    state.exSheet = null; render();
  } else if (a === "edit-ex") {
    const e = state.meals.find((d) => d.id === el.dataset.id);
    if (e) { state.exSheet = { id: e.id, kind: e.kind, minutes: e.minutes, effort: e.effort || "moderate", custom: e.kind === "other", name: e.name, burned: e.burned, desc: e.desc || "", createdAt: e.createdAt }; render(); }
  } else if (a === "ex-kind") {
    keepExInputs(); Object.assign(state.exSheet, { kind: el.dataset.kind, custom: false }); render();
  } else if (a === "ex-effort") {
    keepExInputs(); state.exSheet.effort = el.dataset.effort; if (state.exSheet.custom) state.exSheet.custom = false; render();
  } else if (a === "ex-ask") {
    keepExInputs();
    const x = state.exSheet;
    if (!x.desc?.trim()) { toast("Describe what you did first."); return; }
    x.asking = true; render();
    try {
      const r = await askExercise(x.desc, Number(state.goals?.profile?.weight) || 65, { demo });
      Object.assign(x, { custom: true, kind: "other", name: r.name, minutes: r.minutes || x.minutes, burned: r.burned, note: r.note || "" });
    } catch (e) { x.note = e.message || "Munchkin couldn't estimate that. Try again."; }
    x.asking = false; if (state.exSheet === x) render();
  } else if (a === "ex-save") {
    keepExInputs();
    const x = state.exSheet;
    const kg = Number(state.goals?.profile?.weight) || 65;
    const preset = EXERCISES.find((e) => e[0] === x.kind);
    const effortIdx = Math.max(0, EFFORT.findIndex((e) => e[0] === x.effort));
    const minutes = Math.round(Number(x.minutes) || 0);
    const doc = x.custom
      ? { kind: "other", name: x.name || "Exercise", minutes, effort: "", burned: Math.round(Number(x.burned) || 0), desc: x.desc || "" }
      : { kind: x.kind, name: preset[1].split(" ").slice(1).join(" "), minutes, effort: x.effort, burned: exerciseBurn(preset[2][effortIdx], minutes, kg) };
    const entry = { id: x.id || store.newId(), type: "exercise", date: state.date, ...doc, createdAt: x.createdAt || Date.now(), updatedAt: Date.now() };
    state.exSheet = null; render();
    try { await store.save(entry); toast(`🔥 ${entry.burned} kcal added`); } catch { toast("Couldn't save. Try again."); }
  } else if (a === "save-steps") {
    const v = Math.round(Number(document.getElementById("steps-input")?.value) || 0);
    const id = `steps-${state.date}`;
    try {
      if (v > 0) await store.save({ id, type: "steps", date: state.date, steps: v, createdAt: Date.now(), updatedAt: Date.now() });
      else await store.remove(id);
      toast(v > 0 ? `👣 ${v.toLocaleString()} steps saved` : "Steps cleared");
    } catch { toast("Couldn't save. Try again."); }
  } else if (a === "calendar") {
    openCalendar();
  } else if (a === "cal-month") {
    const step = Number(el.dataset.step);
    const d = new Date(state.cal.year, state.cal.month + step, 1);
    state.cal = { year: d.getFullYear(), month: d.getMonth(), days: null };
    render(); loadCalendarMonth();
  } else if (a === "cal-day") {
    state.date = el.dataset.date; watchDay(); back();
  } else if (a === "home-ask-delete") {
    state.confirmDeleteId = el.dataset.id; render();
  } else if (a === "home-keep") {
    state.confirmDeleteId = null; render();
  } else if (a === "home-delete") {
    state.confirmDeleteId = null;
    try { await store.remove(el.dataset.id); toast("Meal deleted"); } catch { toast("Couldn't delete. Try again."); render(); }
  } else if (a === "goals") {
    openGoals();
  } else if (a === "goal-pick") {
    state.goalForm.profile[el.dataset.field] = el.dataset.value;
    const y = window.scrollY; render(); window.scrollTo(0, y);
    refreshGoalSuggestion();
  } else if (a === "goals-reset") {
    state.goalForm.edited.clear();
    const y = window.scrollY; render(); window.scrollTo(0, y);
    refreshGoalSuggestion();
  } else if (a === "save-goals") {
    const f = state.goalForm;
    const t = Object.fromEntries(TARGETS.map(([k]) => [k, Math.round(Number(f.targets[k]) || 0)]));
    const minCal = safeMinimum(f.profile);
    if (t.calories < minCal) { toast(`Please set at least ${minCal} kcal. Less than that every day isn't healthy.`); return; }
    const p = { ...f.profile };
    try {
      const sug = suggestGoals(p);
      await saveGoalsKeepingHistory({ ...t, maintenance: sug?.maintenance || null, profile: p, edited: [...f.edited], updatedAt: Date.now() });
      toast("Goals saved 🎯");
      back();
    } catch { toast("Couldn't save. Check your internet and try again."); }
  } else if (a === "settings") {
    state.settingsStatus = null; go("settings");
  } else if (a === "back") {
    back();
  } else if (a === "prev-day") {
    state.date = shiftDate(state.date, -1); watchDay(); render();
  } else if (a === "next-day") {
    if (state.date !== iso(new Date())) { state.date = shiftDate(state.date, 1); watchDay(); render(); }
  } else if (a === "open-sheet") {
    state.sheet = true; state.sheetSlot = el.dataset.slot || defaultSlot(); render();
  } else if (a === "close-sheet") {
    state.sheet = false; render();
  } else if (a === "sheet-slot") {
    state.sheetSlot = el.dataset.slot; render();
  } else if (a === "manual") {
    state.sheet = false; state.manual = {}; go("manual");
    setTimeout(() => document.getElementById("mn-name")?.focus(), 50);
  } else if (a === "manual-slot") {
    readManual(); state.sheetSlot = el.dataset.slot; render();
  } else if (a === "manual-save") {
    const f = readManual();
    const n = (x) => Math.max(0, Math.round(Number(String(x).replace(",", ".")) || 0));
    const name = (f.name || "").trim();
    if (!name) { toast("Give it a name first."); document.getElementById("mn-name")?.focus(); return; }
    if (!n(f.calories)) { toast("How many calories?"); document.getElementById("mn-calories")?.focus(); return; }
    const meal = { id: store.newId(), date: state.date, slot: state.sheetSlot || defaultSlot(), name: name.slice(0, 60), photo: null, manual: true,
      items: [{ name: name.slice(0, 60), amount: "", calories: n(f.calories), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) }],
      chat: [], createdAt: Date.now(), updatedAt: Date.now() };
    try { await saveMeal(meal); pendingMood = "munch"; toast(`Added to ${SLOT_NAME[meal.slot].toLowerCase()} 🐱`); state.manual = null; back(); }
    catch { toast("Couldn't save. Try again."); }
  } else if (a === "type-meal") {
    state.sheet = false;
    state.meal = newMeal(null);
    go("meal");
    document.getElementById("composer")?.focus();
  } else if (a === "open-meal") {
    const found = state.meals.find((m) => m.id === el.dataset.id);
    if (!found) return;
    state.meal = structuredClone({ ...found, items: found.items || [], chat: found.chat || [] });
    state.error = null; state.confirmDelete = false; state.composer = "";
    go("meal");
  } else if (a === "meal-slot") {
    state.meal.slot = el.dataset.slot;
    render();
    if (!state.meal._draft) { try { await saveMeal(state.meal); toast(`Moved to ${SLOT_NAME[state.meal.slot].toLowerCase()}`); } catch { toast("Couldn't save that change."); } }
  } else if (a === "view-photo") {
    const m = state.meal;
    const all = [...mealPhotos(m), ...(state.pendingPhotos || [])].filter((x, i, arr) => arr.indexOf(x) === i);
    if (!all.includes(el.dataset.src)) all.push(el.dataset.src);
    openViewer(all, all.indexOf(el.dataset.src));
  } else if (a === "view-thumb") {
    ev.stopPropagation();
    const m = state.meals.find((x) => x.id === el.dataset.id);
    if (m) {
      const all = mealPhotos(m);
      openViewer(all, 0);
    }
  } else if (a === "drop-photo") {
    state.pendingPhotos = (state.pendingPhotos || []).filter((_, i) => i !== Number(el.dataset.i));
    const ta = document.getElementById("composer"); if (ta) state.composer = ta.value;
    render();
  } else if (a === "pick-answer") {
    state.answers = state.answers || {};
    const q = el.dataset.q;
    if (state.answers[q] === el.dataset.text) delete state.answers[q]; else state.answers[q] = el.dataset.text;
    const ta = document.getElementById("composer"); if (ta) state.composer = ta.value;
    render();
  } else if (a === "send-answers") {
    const last = state.meal.chat[state.meal.chat.length - 1];
    const qs = last?.questions || [];
    const lines = Object.entries(state.answers || {}).sort(([x], [y]) => x - y)
      .map(([qi, ans]) => (qs[qi]?.question ? `${qs[qi].question} ${ans}` : ans));
    const extra = (document.getElementById("composer")?.value || "").trim();
    if (extra) lines.push(extra);
    state.answers = {};
    sendMessage(lines.join("\n"));
  } else if (a === "quick") {
    sendMessage(el.dataset.text);
  } else if (a === "retry") {
    runAI();
  } else if (a === "ask-delete") {
    state.confirmDelete = true; render(); window.scrollTo(0, 0);
  } else if (a === "cancel-delete") {
    state.confirmDelete = false; render();
  } else if (a === "delete") {
    const id = state.meal.id;
    try { await store.remove(id); toast("Meal deleted"); } catch { toast("Couldn't delete. Try again."); return; }
    back();
  } else if (a === "toggle-key") {
    const v = document.getElementById("gemini-key").value;
    state.showKey = !state.showKey; render();
    document.getElementById("gemini-key").value = v;
  } else if (a === "save-key") {
    const key = document.getElementById("gemini-key").value.trim();
    const s = loadAISettings();
    const prov = KEY_HELP[s.provider] ? s.provider : "gemini";
    s.keys = { ...(s.keys || {}), [prov]: key };
    saveAISettings(s);
    syncKeysUp();
    if (!key) { state.settingsStatus = { ok: false, text: "Key removed." }; render(); return; }
    state.settingsStatus = { ok: true, text: "Checking your key… (this can take up to a minute)", live: true }; render();
    setAIStatus("Starting…");
    try {
      const t = demo ? await askAI([{ role: "user", text: "one medium apple" }], null, { demo }) : await testProvider(setAIStatus);
      const kcal = t.items.reduce((n, i) => n + i.calories, 0);
      state.settingsStatus = { ok: true, text: `It works! Test guess: ${t.name}, ${kcal} kcal.${t.models?.order ? ` Models: ${t.models.order.join(" → ")}.` : ""}` };
    } catch (e) {
      state.settingsStatus = { ok: false, text: e.message };
    }
    stopAIStatus();
    render();
  } else if (a === "backup") {
    try {
      const docs = await store.getRange("0000-01-01", "9999-12-31");
      const data = { app: "Munchkin", version: 1, exportedAt: new Date().toISOString(), goals: state.goals || null, entries: docs };
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `munchkin-backup-${iso(new Date())}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      state.backupStatus = { ok: true, text: `Saved ${docs.length} entries to your downloads.` };
    } catch { state.backupStatus = { ok: false, text: "Couldn't make the backup. Check your internet and try again." }; }
    render();
  } else if (a === "signout") {
    await store.signOut();
  }
});

$app.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "pick-chat-photo" || t.id === "pick-chat-camera") {
    addChatPhoto([...(t.files || [])]);
    return;
  }
  if (t.id === "pick-label") {
    const file = t.files && t.files[0];
    if (!file) return;
    state.sheet = false;
    let photo;
    try { photo = await readPhoto(file, 1024); } catch { toast("Couldn't open that photo. Try another one."); render(); return; }
    const fromCode = state.view === "barcode" && state.bc?.code ? state.bc.code : null;
    state.meal = newMeal(photo);
    state.meal.label = true;
    if (fromCode) state.meal.barcode = fromCode;
    state.error = null; state.composer = ""; state.pendingPhotos = [];
    go("meal");
    sendMessage("This is a photo of a nutrition label. Read it: tell me the product, the values per 100 g and per pack or portion, then ask me how much I had.");
    return;
  }
  if (t.id === "pick-barcode") {
    const file = t.files && t.files[0];
    if (!file) return;
    state.sheet = false;
    state.bc = { status: "reading", slot: state.sheetSlot };
    go("barcode");
    try {
      const code = await readBarcode(file);
      if (!code) { state.bc.status = "nocode"; render(); return; }
      await findBarcode(code);
    } catch (e) { state.bc.status = "error"; state.bc.error = e.message; render(); }
    return;
  }
  if (t.id === "pick-camera" || t.id === "pick-gallery") {
    const file = t.files && t.files[0];
    if (!file) return;
    state.sheet = false;
    let photo;
    try { photo = await readPhoto(file); } catch { toast("Couldn't open that photo. Try another one."); render(); return; }
    state.meal = newMeal(photo);
    state.error = null; state.composer = ""; state.pendingPhotos = [];
    go("meal");
    const rest = [...t.files].slice(1);
    if (rest.length) addChatPhoto(rest); // extra photos wait to be sent with the first message
  } else if (t.id === "g-cycle") {
    state.goalForm.profile.trackCycle = t.checked;
  } else if (t.name === "provider") {
    const s = loadAISettings(); s.provider = t.value; saveAISettings(s);
    state.settingsStatus = null; state.showKey = false; render(); syncKeysUp();
  } else if (t.id === "sync-keys") {
    const s = loadAISettings(); s.syncKeys = t.checked; saveAISettings(s);
    try {
      if (t.checked) { await syncKeysUp(); toast("Keys saved to your account 🔒"); }
      else { await store.saveKeys(null); toast("Keys removed from your account"); }
    } catch { toast("Couldn't save. Try again."); }
  } else if (t.id === "restore-file") {
    const file = t.files && t.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "Munchkin" || !Array.isArray(data.entries)) throw new Error();
      state.backupStatus = { ok: true, text: `Restoring ${data.entries.length} entries…` }; render();
      for (const e of data.entries) if (e && e.id && e.date) await store.save(e);
      if (data.goals && !state.goals) await store.saveGoals(data.goals);
      state.backupStatus = { ok: true, text: `Restored ${data.entries.length} entries 🐱` };
    } catch { state.backupStatus = { ok: false, text: "That file isn't a Munchkin backup." }; }
    render();
  }
});

$app.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "bc-g" && state.bc?.product) {
    state.bc.grams = t.value;
    const out = document.getElementById("bc-kcal"); if (out) out.textContent = `${forGrams(state.bc.product, Number(t.value) || 0).calories} kcal`;
    const lab = document.querySelector(".ex-result span"); if (lab) lab.textContent = `${Number(t.value) || 0} g`;
    return;
  }
  if (t.id === "ex-min" && state.exSheet && !state.exSheet.custom) {
    state.exSheet.minutes = t.value;
    const x = state.exSheet, preset = EXERCISES.find((e) => e[0] === x.kind);
    const out = document.querySelector(".ex-result strong");
    if (preset && out) out.textContent = `🔥 ${exerciseBurn(preset[2][Math.max(0, EFFORT.findIndex((e) => e[0] === x.effort))], Number(t.value) || 0, Number(state.goals?.profile?.weight) || 65)} kcal`;
    return;
  }
  if (state.view === "goals" && t.dataset.pf) { state.goalForm.profile[t.dataset.pf] = t.value; refreshGoalSuggestion(); return; }
  if (state.view === "goals" && t.dataset.tg) {
    state.goalForm.targets[t.dataset.tg] = t.value;
    state.goalForm.edited.add(t.dataset.tg);
    const chk = document.getElementById("g-check"); if (chk) chk.textContent = macroCheck();
    return;
  }
  if (ev.target.id === "steps-input") {
    const btn = document.getElementById("steps-save");
    if (btn) btn.hidden = ev.target.value.trim() === "" || ev.target.value === ev.target.dataset.saved;
    return;
  }
  if (ev.target.id === "composer") {
    state.composer = ev.target.value; autoGrow(ev.target);
    const dt = document.getElementById("draft-text"); if (dt) dt.textContent = ev.target.value;
  }
});
$app.addEventListener("keydown", (ev) => {
  if (ev.target.id === "steps-input" && ev.key === "Enter") { const b = document.getElementById("steps-save"); if (b && !b.hidden) b.click(); return; }
  if (ev.target.id === "composer" && ev.key === "Enter" && !ev.shiftKey && window.matchMedia("(pointer: fine)").matches) {
    ev.preventDefault();
    ev.target.form.requestSubmit();
  }
});
$app.addEventListener("submit", (ev) => {
  if (ev.target.dataset.form !== "chat") return;
  ev.preventDefault();
  sendMessage(state.composer.trim());
});

// ---------- start ----------
async function start() {
  render();
  try {
    store = await createStore({ demo });
  } catch {
    $app.innerHTML = `<div class="login"><div class="inner"><div class="hero-cat">${catPic()}</div><p>Munchkin couldn't connect. Check your internet and reopen the app.</p></div></div>`;
    return;
  }
  store.onUser((u) => {
    state.user = u;
    if (!u) {
      if (unsubDay) unsubDay();
      unsubDay = null;
      if (unsubGoals) unsubGoals();
      unsubGoals = null; state.goals = null;
      state.meals = [];
      state.view = "login";
      render();
      return;
    }
    state.date = iso(new Date());
    state.view = "day";
    watchDay();
    if (unsubGoals) unsubGoals();
    syncKeysDown();
    applyHealthLink();
    syncHealth();
    loadBody().then(() => syncCycle());
    restoreOpen();
    setTimeout(deliverRestoredPhoto, 50);
    unsubGoals = store.watchGoals((g) => { state.goals = g; state.cycle && null; if (state.view === "day" || state.view === "settings") render(); refreshWeek(); });
    render();
  });
  if ("serviceWorker" in navigator && !demo) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
// Show the right "today" if the app was left open overnight.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.view === "day" && store && state.user) {
    const today = iso(new Date());
    if (state.lastSeenToday && state.lastSeenToday !== today && state.date === state.lastSeenToday) {
      state.date = today; watchDay(); render();
    }
    state.lastSeenToday = today;
  }
});
state.lastSeenToday = iso(new Date());
start();
