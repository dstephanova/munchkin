import { catSVG } from "./cat.js";
import { createStore } from "./store.js";
import { askAI, hasKey, loadAISettings, saveAISettings, pickGeminiModels, PROVIDERS } from "./ai.js";

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
  view: "loading", // loading | login | day | meal | settings
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
    $app.innerHTML = `<div class="login"><div class="inner"><div class="hero-cat">${catSVG()}</div><p>Waking Munchkin up…</p></div></div>`;
    return;
  }
  if (state.view === "login") return renderLogin();
  if (state.view === "settings") return renderSettings();
  if (state.view === "meal") return renderMeal();
  return renderDay();
}

function renderLogin() {
  $app.innerHTML = `
  <main class="login">
    <div class="inner">
      <div class="hero-cat">${catSVG()}</div>
      <h1>Munchkin</h1>
      <p>Snap what you eat. Munchkin guesses the calories, and you fix anything by chatting.</p>
      <button class="google-btn" data-action="signin">${ICON.google} Log in with Google</button>
      ${state.loginError ? `<p class="status-line bad">${esc(state.loginError)}</p>` : ""}
      <p style="font-size:.82rem">Your diary is private. Only you can see it.</p>
    </div>
  </main>`;
}

function renderDay() {
  const meals = state.meals;
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
          return `<button class="meal-card" data-action="open-meal" data-id="${esc(m.id)}">
            ${m.photo ? `<img class="thumb" src="${esc(m.photo)}" alt="">` : `<span class="thumb">${catSVG({ label: "" })}</span>`}
            <span class="info"><span class="name">${esc(m.name || "Meal")}</span>
              <span class="mini">P ${mt.protein}g · C ${mt.carbs}g · F ${mt.fat}g</span></span>
            <span class="kc">${mt.calories} kcal</span>
          </button>`;
        }).join("")}
        ${list.length === 0 ? `<button class="add-slot" data-action="open-sheet" data-slot="${id}">+ Add ${label.toLowerCase()}</button>` : ""}
      </div>
    </section>`;
  }).join("");

  $app.innerHTML = `
  <main class="screen">
    <header class="topbar">
      <span class="logo-cat">${catSVG({ label: "" })}</span>
      <h1>Munchkin</h1>
      <span class="spacer"></span>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${ICON.gear}</button>
    </header>
    ${needKey ? `<div class="card"><h2>One last thing</h2><p>Add your free Gemini key so Munchkin can guess your food.</p><div class="btn-row"><button class="btn" data-action="settings">Add my key</button></div></div>` : ""}
    <nav class="datenav" aria-label="Choose day">
      <button class="icon-btn" data-action="prev-day" aria-label="Previous day">${ICON.back}</button>
      <div class="label"><strong>${prettyDate(state.date)}</strong><span>${longDate(state.date)}</span></div>
      <button class="icon-btn" data-action="next-day" aria-label="Next day" ${isToday ? "disabled" : ""}>${ICON.next}</button>
    </nav>
    <section class="summary">
      <div class="cat-wrap">${catSVG()}</div>
      <div>
        <div class="kcal">${t.calories}<small>kcal</small></div>
        <p class="bubble">${bubble}</p>
        ${macrosHTML(t)}
      </div>
    </section>
    ${slotsHTML}
  </main>
  <button class="fab" data-action="open-sheet">${ICON.plus} Add meal</button>
  ${state.sheet ? sheetHTML() : ""}`;
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
        <label class="big-action">${ICON.image}<span>From gallery</span><input type="file" id="pick-gallery" accept="image/*"></label>
        <button class="big-action" data-action="type-meal">${ICON.pen}<span>Type it</span></button>
      </div>
    </div>
  </div>`;
}

function renderMeal() {
  const m = state.meal;
  if (!m) { state.view = "day"; return render(); }
  const t = sumItems(m.items);
  const firstTime = m.chat.length === 0;
  const placeholder = firstTime ? "What did you eat? e.g. two slices of pizza" : "Fix anything, e.g. it was half a portion";

  const chatHTML = m.chat.map((c, i) => {
    if (c.role === "model") {
      return `<div class="model-row"><span class="mini-cat">${catSVG({ label: "" })}</span><div class="msg model">${esc(c.text)}</div></div>`;
    }
    const txt = c.text || "";
    const note = i === 0 && m.photo ? `<span class="photo-note">📷 photo sent</span>` : "";
    return `<div class="msg user">${txt ? esc(txt) : "What's this?"}${note}</div>`;
  }).join("");

  $app.innerHTML = `
  <main class="screen">
    <header class="topbar meal-top">
      <button class="icon-btn" data-action="back" aria-label="Back to day">${ICON.back}</button>
      <div class="title"><strong>${esc(m.items.length ? m.name : "New meal")}</strong><span>${SLOT_NAME[m.slot] || "Meal"} · ${prettyDate(m.date)}</span></div>
      ${m._draft ? "" : `<button class="icon-btn" data-action="ask-delete" aria-label="Delete meal">${ICON.trash}</button>`}
    </header>
    ${state.confirmDelete ? `<div class="confirm"><strong>Delete this meal?</strong><p style="margin:0;color:var(--muted)">It disappears from your diary for good.</p>
      <div class="btn-row"><button class="btn danger" data-action="delete">Delete</button><button class="btn ghost" data-action="cancel-delete">Keep it</button></div></div>` : ""}
    ${m.items.length ? `
    <section class="nutri">
      <div class="row"><span class="kcal">${t.calories}<small> kcal</small></span></div>
      ${macrosHTML(t)}
      <ul class="items">${m.items.map((it) => `<li><span>${esc(it.name)} <em>${esc(it.amount)}</em></span><span>${it.calories} kcal</span></li>`).join("")}</ul>
    </section>` : ""}
    ${m.photo ? `<div class="meal-photo"><img src="${esc(m.photo)}" alt="Your meal photo"></div>` : ""}
    <div class="chips slot-row" aria-label="Meal time">
      ${SLOTS.map(([id, label]) => `<button class="chip" data-action="meal-slot" data-slot="${id}" aria-pressed="${m.slot === id}">${label}</button>`).join("")}
    </div>
    <section class="chat" aria-label="Chat with Munchkin">
      ${firstTime && !state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "" })}</span><div class="msg model">${m.photo ? "Tap send and I'll guess what's on your plate. You can add notes first, like \"I only ate half\"." : "Tell me what you ate and roughly how much!"}</div></div>` : ""}
      ${chatHTML}
      ${state.sending ? `<div class="model-row"><span class="mini-cat">${catSVG({ label: "" })}</span><div><div class="msg model thinking" aria-label="Munchkin is thinking"><i></i><i></i><i></i></div><div class="ai-status" id="ai-status"></div></div></div>` : ""}
      ${state.error ? `<div class="msg error">${esc(state.error.text)}
        <div class="btn-row" style="margin-top:8px">${state.error.retry ? `<button class="btn" data-action="retry">Try again</button>` : ""}${state.error.settings ? `<button class="btn ghost" data-action="settings">Open settings</button>` : ""}</div></div>` : ""}
    </section>
  </main>
  <div class="composer">
    <form data-form="chat">
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
      <h2>Account</h2>
      <p>${u.name ? `${esc(u.name)}<br>` : ""}${esc(u.email || "")}</p>
      <p>Your diary is saved online, so it's safe even if you reset your phone. Only you can see it.</p>
      <div class="btn-row"><button class="btn ghost" data-action="signout">Log out</button></div>
    </section>
  </main>`;
}

function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
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
  if (state.view === "meal" || state.view === "settings") {
    state.settingsStatus = null;
    go("day");
  }
});

function watchDay() {
  if (unsubDay) unsubDay();
  unsubDay = store.watchDay(state.date, (meals) => {
    state.meals = meals;
    if (state.view === "day") render();
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
  if (!text && m.chat.length > 0) return;
  if (!text && !m.photo) return;
  m.chat.push({ role: "user", text: text || "" });
  state.composer = "";
  runAI();
}

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
    const res = await askAI(turns, m.chat.length <= 24 ? m.photo : null, { demo, onStatus: setAIStatus });
    stopAIStatus();
    m.chat.push({ role: "model", text: res.reply, raw: JSON.stringify({ reply: res.reply, meal: { name: res.name, items: res.items } }) });
    m.name = res.name;
    m.items = res.items;
    state.sending = false;
    if (state.meal === m) { render(); scrollToEnd(); }
    try { await saveMeal(m); } catch { toast("Couldn't save. It will retry when you're online."); }
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
  if (el.dataset.action === "close-sheet" && ev.target.closest("[data-stop]")) return;
  const a = el.dataset.action;

  if (a === "signin") {
    state.loginError = "";
    try { await store.signIn(); } catch (e) { state.loginError = e.message; render(); }
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
      state.settingsStatus = { ok: true, text: `It works! Test guess: ${t.name}, ${kcal} kcal.${set ? ` Main model: ${set.main}, backup: ${set.lite}.` : ""}` };
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
  if (t.id === "pick-camera" || t.id === "pick-gallery") {
    const file = t.files && t.files[0];
    if (!file) return;
    state.sheet = false;
    let photo;
    try { photo = await readPhoto(file); } catch { toast("Couldn't open that photo. Try another one."); render(); return; }
    state.meal = newMeal(photo);
    state.error = null; state.composer = "";
    go("meal");
  } else if (t.name === "provider") {
    const s = loadAISettings(); s.provider = t.value; saveAISettings(s);
  }
});

$app.addEventListener("input", (ev) => {
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
    $app.innerHTML = `<div class="login"><div class="inner"><div class="hero-cat">${catSVG()}</div><p>Munchkin couldn't connect. Check your internet and reopen the app.</p></div></div>`;
    return;
  }
  store.onUser((u) => {
    state.user = u;
    if (!u) {
      if (unsubDay) unsubDay();
      unsubDay = null;
      state.meals = [];
      state.view = "login";
      render();
      return;
    }
    state.date = iso(new Date());
    state.view = "day";
    watchDay();
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
