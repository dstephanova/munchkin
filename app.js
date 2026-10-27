import { openViewer } from "./viewer.js";
import { readBarcode, lookupProduct, forGrams } from "./barcode.js";
import { catSVG } from "./cat.js";
import { ACTIVITY, PACES, paceOf, paceOptions, safeMinimum, suggestGoals, KCAL_PER_KG, EXERCISES, EFFORT, exerciseBurn, stepsBurn } from "./goals.js";
import { createStore } from "./store.js";
import { askExercise, askAI, hasKey, loadAISettings, saveAISettings, pickGeminiModels, PROVIDERS } from "./ai.js";

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
  const src = size === "big" ? "img/munchkin-480.webp" : "img/munchkin-160.webp";
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
function render() {
  if (state.view === "loading") {
    $app.innerHTML = `<div class="login"><div class="inner"><div class="hero-cat">${catPic()}</div><p>Waking Munchkin up…</p></div></div>`;
    return;
  }
  if (state.view === "login") return renderLogin();
  if (state.view === "settings") return renderSettings();
  if (state.view === "goals") return renderGoals();
  if (state.view === "calendar") return renderCalendar();
  if (state.view === "barcode") return renderBarcode();
  if (state.view === "meal") return renderMeal();
  return renderDay();
}

function renderLogin() {
  $app.innerHTML = `
  <main class="login">
    <div class="inner">
      <div class="hero-cat">${catPic()}</div>
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
  const sb = st ? stepsBurn(st.steps, state.goals?.profile).burned : 0;
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
    <section class="slot">
      <div class="slot-head"><h2>${label}</h2>${list.length ? `<span class="sum">${st.calories} kcal</span>` : ""}</div>
      <div class="meal-list">
        ${list.map((m) => {
          const mt = sumItems(m.items);
          if (state.confirmDeleteId === m.id) {
            return `<div class="meal-card confirm-row"><span class="info"><span class="name">Delete “${esc(m.name || "Meal")}”?</span><span class="mini">It's gone for good.</span></span>
              <span class="btn-row"><button class="btn danger small" data-action="home-delete" data-id="${esc(m.id)}">Delete</button><button class="btn ghost small" data-action="home-keep">Keep</button></span></div>`;
          }
          return `<div class="meal-wrap"><button class="meal-card" data-action="open-meal" data-id="${esc(m.id)}">
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
    ${needKey ? `<div class="card"><h2>One last thing</h2><p>Add your free Gemini key so Munchkin can guess your food.</p><div class="btn-row"><button class="btn" data-action="settings">Add my key</button></div></div>` : ""}
    <nav class="datenav" aria-label="Choose day">
      <button class="icon-btn" data-action="prev-day" aria-label="Previous day">${ICON.back}</button>
      <button class="label" data-action="calendar" aria-label="Open calendar"><strong>${prettyDate(state.date)}</strong><span>${longDate(state.date)} · 📅</span></button>
      <button class="icon-btn" data-action="next-day" aria-label="Next day" ${isToday ? "disabled" : ""}>${ICON.next}</button>
    </nav>
    ${summaryHTML(t, bubble, dayBurn(state.meals))}
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
  const g0 = state.goals;
  const g = g0 ? { ...g0, calories: g0.calories + burn.total } : null;
  if (!g) {
    return `<section class="summary">
      <div class="cat-wrap">${catPic()}</div>
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
    <div class="cat-wrap">${catPic()}</div>
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
  const sb = st ? stepsBurn(st.steps, state.goals?.profile) : null;
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
        <input id="steps-input" type="number" inputmode="numeric" placeholder="from Google Fit" value="${st ? esc(st.steps) : ""}">
        <button class="btn small" data-action="save-steps">Save</button>
        ${sb ? `<span class="steps-note">${sb.burned ? `🔥 ${sb.burned} kcal from steps over your usual ${sb.base.toLocaleString()}` : `Within your usual ${sb.base.toLocaleString()} steps, already counted`}</span>` : ""}
      </div>
      <button class="add-slot" data-action="open-ex">+ Add exercise</button>
    </div>
  </section>`;
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
      <p class="help">Calories burned on top of resting, estimated from your weight (${kg} kg${state.goals?.profile?.weight ? "" : ", set it in Goals for better numbers"}).</p>
      <div class="btn-row"><button class="btn" data-action="ex-save" ${burned == null ? "disabled" : ""}>${x.id ? "Save" : "Add"}</button><button class="btn ghost" data-action="close-ex">Cancel</button></div>
    </div>
  </div>`;
}

function weekHTML() {
  const w = state.week;
  if (!w || w.days < 2) return "";
  const kg = w.kgWeek;
  const pace = Math.abs(kg) < 0.05 ? "about steady" : `about ${kg > 0 ? "+" : "−"}${Math.abs(kg).toFixed(2)} kg a week`;
  return `<p class="week-note">📈 Last 7 days: you averaged <strong>${w.avg} kcal</strong> a day${w.burn ? ` (minus ${w.burn} burned)` : ""} over ${w.days} logged days. At this pace that's <strong>${pace}</strong>. <span>Estimate. Water and salt make the scale jump around.</span></p>`;
}
let weekTimer = null;
function refreshWeek() {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(async () => {
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
        <button class="big-action" data-action="ask"><span class="ba-emoji">💬</span><span>Just asking</span></button>
      </div>
      <p class="help">Label: snap the nutrition table on the package. Barcode: snap the stripes, and Munchkin looks it up in a free food database.</p>
    </div>
  </div>`;
}

function renderMeal() {
  const m = state.meal;
  if (!m) { state.view = "day"; return render(); }
  const t = sumItems(m.items);
  const firstTime = m.chat.length === 0;
  const placeholder = m.askOnly ? "Ask anything, e.g. calories in a croissant?" : firstTime ? "What did you eat? e.g. two slices of pizza" : "Fix anything, or add a photo";

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
    ${m.photo ? `<button class="meal-photo" data-action="view-photo" data-src="${esc(m.photo)}" aria-label="Open photo full screen"><img src="${esc(m.photo)}" alt="Your meal photo"></button>` : ""}
    <div class="chips slot-row" aria-label="Meal time">
      ${SLOTS.map(([id, label]) => `<button class="chip" data-action="meal-slot" data-slot="${id}" aria-pressed="${m.slot === id}">${label}</button>`).join("")}
    </div>
    <section class="chat" aria-label="Chat with Munchkin">
      ${firstTime && !state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "", head: true })}</span><div class="msg model">${m.askOnly ? "Ask me anything about food! Like \"how many calories in a croissant?\" or \"which is lighter, a wrap or a salad?\". Nothing goes in your diary unless you tap Add." : m.photo ? "Tap send and I'll guess what's on your plate. You can add notes first, like \"I only ate half\"." : "Tell me what you ate and roughly how much!"}</div></div>` : ""}
      ${chatHTML}
      ${state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "", head: true })}</span><div><div class="msg model thinking" aria-label="Munchkin is thinking"><i></i><i></i><i></i></div><div class="ai-status" id="ai-status"></div></div></div>` : ""}
      ${state.error ? `<div class="msg error">${esc(state.error.text)}
        <div class="btn-row" style="margin-top:8px">${state.error.retry ? `<button class="btn" data-action="retry">Try again</button>` : ""}${state.error.settings ? `<button class="btn ghost" data-action="settings">Open settings</button>` : ""}</div></div>` : ""}
    </section>
  </main>
  <div class="composer">
    ${(state.pendingPhotos || []).length ? `<div class="pending-photo">${state.pendingPhotos.map((ph, i) => `<span class="pend"><img src="${esc(ph)}" alt="Photo to send" data-action="view-photo" data-src="${esc(ph)}"><button data-action="drop-photo" data-i="${i}" aria-label="Remove photo">✕</button></span>`).join("")}<span class="pend-note">${state.pendingPhotos.length} ready to send</span></div>` : ""}
    <form data-form="chat">
      <label class="photo-btn" aria-label="Add a photo">${ICON.camera}<input type="file" id="pick-chat-photo" accept="image/*" multiple></label>
      <textarea id="composer" rows="1" placeholder="${esc(placeholder)}" aria-label="Message to Munchkin"></textarea>
      <button class="send-btn" type="submit" aria-label="Send" ${state.sending ? "disabled" : ""}>${ICON.send}</button>
    </form>
  </div>`;
  const ta = document.getElementById("composer");
  ta.value = state.composer;
  autoGrow(ta);
}

function renderSettings() {
  const s = loadAISettings();
  const key = s.keys?.gemini || "";
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
        <label for="gemini-key">Your Gemini key</label>
        <input id="gemini-key" type="${state.showKey ? "text" : "password"}" autocomplete="off" spellcheck="false" placeholder="Paste it here" value="${esc(key)}">
      </div>
      <div class="btn-row">
        <button class="btn" data-action="save-key">Save and test</button>
        <button class="btn ghost" data-action="toggle-key">${state.showKey ? "Hide" : "Show"}</button>
      </div>
      ${state.settingsStatus ? `<p class="status-line ${state.settingsStatus.ok ? "ok" : "bad"}">${esc(state.settingsStatus.text)}</p>` : ""}
      ${state.settingsStatus?.live ? `<p class="ai-status" id="ai-status"></p>` : ""}
      <p>No key yet? <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free one from Google AI Studio</a>, tap "Create API key", copy it, and paste it above.</p>
      <p>Your key stays on this device only. On a new phone, paste it again.</p>
    </section>
    <section class="card">
      <h2>Daily goals</h2>
      ${state.goals ? `<p>${state.goals.calories} kcal · protein ${state.goals.protein} g · carbs ${state.goals.carbs} g · fat ${state.goals.fat} g</p>` : `<p>Not set yet. Munchkin can work them out for you.</p>`}
      <div class="btn-row"><button class="btn" data-action="goals">${state.goals ? "Change my goals" : "Set my goals"}</button></div>
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
      <div class="field-row">
        <div class="field"><label for="g-age">Age</label><input id="g-age" type="number" inputmode="numeric" data-pf="age" value="${esc(p.age)}" placeholder="e.g. 30"></div>
        <div class="field"><label for="g-height">Height (cm)</label><input id="g-height" type="number" inputmode="numeric" data-pf="height" value="${esc(p.height)}" placeholder="e.g. 165"></div>
        <div class="field"><label for="g-weight">Weight (kg)</label><input id="g-weight" type="number" inputmode="decimal" data-pf="weight" value="${esc(p.weight)}" placeholder="e.g. 60"></div>
      </div>
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
async function findBarcode(code) {
  const bc = state.bc;
  bc.code = code; bc.status = "looking"; render();
  try {
    const p = demo && code === "1234567890123"
      ? { code, name: "Example lasagna", brand: "Demo", image: "", packGrams: 400, packText: "400 g", servingGrams: null, servingText: "", per100: { calories: 145, protein: 7, carbs: 15, fat: 6 } }
      : await lookupProduct(code);
    if (state.bc !== bc) return;
    if (!p) { bc.status = "notfound"; }
    else if (p.missing) { bc.status = "nonutrition"; bc.product = p; }
    else { bc.status = "found"; bc.product = p; bc.grams = p.packGrams || 100; }
  } catch (e) { bc.status = "error"; bc.error = e.message; }
  if (state.view === "barcode") render();
}
function renderBarcode() {
  const bc = state.bc || { status: "nocode" };
  const p = bc.product;
  let body = "";
  if (bc.status === "reading") body = `<p>Reading the barcode…</p>`;
  else if (bc.status === "looking") body = `<p>Found code <strong>${esc(bc.code)}</strong>. Looking it up…</p>`;
  else if (["nocode", "notfound", "nonutrition", "error"].includes(bc.status)) {
    const msg = {
      nocode: "Munchkin couldn't read a barcode in that photo. Try again closer, with the stripes sharp and straight, or type the number under the stripes.",
      notfound: `This product (${esc(bc.code || "")}) isn't in the food database yet. Snap the nutrition label instead, and Munchkin will read it.`,
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
      <p class="help">From Open Food Facts, a free food database filled in by people. If the numbers look off, compare with the label.</p>`;
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
  const goal = state.goals?.calories || 0;
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdays = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
  const isThisMonth = c.year === new Date().getFullYear() && c.month === new Date().getMonth();
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-cell empty"></span>`;
  let logged = 0, total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = iso(new Date(c.year, c.month, day));
    const info = c.days?.[key];
    const future = key > today;
    if (info) { logged++; total += info.calories; }
    const dayGoal = goal + (info?.burned || 0);
    const status = !info ? "" : goal ? (info.calories > dayGoal * 1.05 ? "over" : info.calories >= dayGoal * 0.85 ? "near" : "under") : "logged";
    cells += `<button class="cal-cell ${status} ${key === today ? "today" : ""} ${key === state.date ? "picked" : ""}" data-action="cal-day" data-date="${key}" ${future ? "disabled" : ""}>
      <span class="num">${day}</span>${info ? `<span class="ck">${info.calories}</span>` : ""}</button>`;
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
      ${goal ? `<div class="cal-legend"><span><i class="near"></i>Around your goal</span><span><i class="under"></i>Under</span><span><i class="over"></i>Over</span></div>` : ""}
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
  if (["meal", "settings", "goals", "calendar", "barcode"].includes(state.view)) {
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
  const { _draft, ...clean } = m;
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
  render();
  document.getElementById("composer")?.focus();
}
document.addEventListener("paste", (ev) => {
  if (state.view !== "meal") return;
  const items = [...(ev.clipboardData?.items || [])].filter((it) => it.type.startsWith("image/"));
  if (!items.length) return;
  ev.preventDefault();
  addChatPhoto(items.map((it) => it.getAsFile()));
});

async function runAI() {
  const m = state.meal;
  if (!demo && !hasKey()) {
    state.error = { text: "Munchkin needs your free Gemini key before it can guess food.", settings: true, retry: false };
    render(); scrollToEnd();
    return;
  }
  state.error = null;
  state.sending = true;
  state.aiStart = Date.now(); state.aiStatus = "Thinking…";
  render(); scrollToEnd(); setAIStatus("Thinking…");
  try {
    const turns = m.chat.slice(-24);
    const res = await askAI(turns, m.chat.length <= 24 && !m.photoFromChat ? m.photo : null, { demo, onStatus: setAIStatus, meal: { name: m.name, items: m.items } });
    stopAIStatus();
    m.chat.push({ role: "model", text: res.reply, sources: res.sources || [], questions: res.questions || [] });
    state.answers = {};
    m.estimate = !!res.estimate;
    if (res.countFailed) toast("Couldn't update the numbers this time. Send a message to try again.");
    m.name = res.name;
    m.items = res.items;
    state.sending = false;
    if (state.meal === m) { render(); scrollToEnd(); }
    if (!m.askOnly) { try { await saveMeal(m); } catch { toast("Couldn't save. It will retry when you're online."); } }
  } catch (e) {
    stopAIStatus();
    state.sending = false;
    if (state.meal !== m) return;
    state.error = {
      text: e.message || "Something went wrong.",
      retry: e.kind !== "key" && e.kind !== "nokey",
      settings: e.kind === "key" || e.kind === "nokey",
    };
    if (state.meal === m) { render(); scrollToEnd(); }
  }
}

// ---------- events ----------
$app.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  if ((el.dataset.action === "close-sheet" || el.dataset.action === "close-ex") && el.classList.contains("sheet-backdrop") && ev.target.closest("[data-stop]")) return;
  const a = el.dataset.action;

  if (a === "signin") {
    state.loginError = "";
    try { await store.signIn(); } catch (e) { state.loginError = e.message; render(); }
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
    try { await saveMeal(meal); toast(`Added ${t.calories} kcal 🐱`); } catch { toast("Couldn't save. Try again."); return; }
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
    if (t.calories < 800) { toast("Please set calories of at least 800."); return; }
    const p = { ...f.profile };
    try {
      const sug = suggestGoals(p);
      await store.saveGoals({ ...t, maintenance: sug?.maintenance || null, profile: p, edited: [...f.edited], updatedAt: Date.now() });
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
    s.keys = { ...(s.keys || {}), gemini: key };
    s.models = {};
    saveAISettings(s);
    if (!key) { state.settingsStatus = { ok: false, text: "Key removed." }; render(); return; }
    state.settingsStatus = { ok: true, text: "Checking your key… (this can take up to a minute)", live: true }; render();
    setAIStatus("Starting…");
    try {
      if (!demo) {
        const models = await pickGeminiModels(key, setAIStatus);
        s.models = { geminiSet: models }; saveAISettings(s);
      }
      const t = await askAI([{ role: "user", text: "one medium apple" }], null, { demo, onStatus: setAIStatus });
      const kcal = t.items.reduce((n, i) => n + i.calories, 0);
      const set = loadAISettings().models?.geminiSet;
      state.settingsStatus = { ok: true, text: `It works! Test guess: ${t.name}, ${kcal} kcal.${set?.order ? ` Models: ${set.order.join(" → ")}.` : ""}` };
    } catch (e) {
      state.settingsStatus = { ok: false, text: e.message };
    }
    stopAIStatus();
    render();
  } else if (a === "signout") {
    await store.signOut();
  }
});

$app.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "pick-chat-photo") {
    addChatPhoto([...(t.files || [])]);
    return;
  }
  if (t.id === "pick-label") {
    const file = t.files && t.files[0];
    if (!file) return;
    state.sheet = false;
    let photo;
    try { photo = await readPhoto(file, 1024); } catch { toast("Couldn't open that photo. Try another one."); render(); return; }
    state.meal = newMeal(photo);
    state.meal.label = true;
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
  } else if (t.name === "provider") {
    const s = loadAISettings(); s.provider = t.value; saveAISettings(s);
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
  if (ev.target.id === "composer") { state.composer = ev.target.value; autoGrow(ev.target); }
});
$app.addEventListener("keydown", (ev) => {
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
    unsubGoals = store.watchGoals((g) => { state.goals = g; if (state.view === "day" || state.view === "settings") render(); refreshWeek(); });
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
