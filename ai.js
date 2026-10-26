// Talking to the food-guessing AI.
// Each person's key lives only on their own device (localStorage), never in the cloud diary.

const KEY_STORE = "munchkin.ai";

export const PROVIDERS = [
  { id: "gemini", name: "Gemini", note: "Free key from Google AI Studio", ready: true },
  { id: "openai", name: "ChatGPT", note: "Coming in a later update", ready: false },
  { id: "claude", name: "Claude", note: "Coming in a later update", ready: false },
];

export function loadAISettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY_STORE)) || { provider: "gemini", keys: {}, models: {} };
  } catch {
    return { provider: "gemini", keys: {}, models: {} };
  }
}
export function saveAISettings(s) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify(s)); } catch {}
}
export function hasKey() {
  const s = loadAISettings();
  return !!(s.keys && s.keys[s.provider]);
}

// Step 1: Munchkin chats normally (with Google Search) and the person sees this answer as written.
const CHAT_RULES = `You are Munchkin, a friendly, helpful cat inside a food diary app. Answer like a knowledgeable nutrition assistant would in a normal chat.
The person tells you or shows you what they ate, and may correct you afterwards.

- Always reply in the same language the person writes in.
- When they name a brand, shop, packaged product, restaurant or chain dish, ALWAYS use Google Search to find the real product, its nutrition per 100 g and its package size(s). If you can't find the exact product, say so honestly and use typical values.
- If the portion or product variant is unclear (e.g. several package sizes), show the options with calories for each, and ask which one they had.
- Give calories plus protein, carbs and fat. Ranges are fine when things are uncertain.
- For plain basic foods, use your own knowledge. If the photo is a nutrition label, read it.
- When corrected, treat the correction as fact and give the updated numbers.
- If it isn't food, say so kindly. Never lecture about diet.
- Use simple formatting: short paragraphs, "* " bullet lines and **bold** are fine; no tables.`;

// Step 2: a quick, cheap model turns that answer into numbers for the calorie card, plus tap-answers.
const EXTRACT_RULES = `You turn a food-diary chat into numbers. Read the chat below between a person and Munchkin (a food helper).
Using Munchkin's LAST answer (and earlier messages for context), list the FULL meal the person ate with Munchkin's estimates.
- If a range or several options are given and the person hasn't chosen yet, use the middle / most typical one and set "estimate": true.
- If a macro is missing, estimate it sensibly. If nothing edible was eaten, return "items": [].
- "options": if Munchkin's last answer asks the person a question, give 2-4 very short tap-answers they could send back (max 30 characters each, in the person's language, e.g. "500 g pack", "1 kg pack", "About half"). Otherwise [].
- "name": short meal name in the person's language, max 5 words.
Reply with ONLY this JSON:
{"name": "", "estimate": false, "options": [], "items": [{"name": "food item", "amount": "e.g. 300 g", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}]}`;

function cleanJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

function normalise(obj) {
  const meal = obj && obj.meal ? obj.meal : {};
  const items = Array.isArray(meal.items) ? meal.items : [];
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  return {
    reply: String(obj?.reply || "Here's my best guess!"),
    name: String(meal.name || "Meal").slice(0, 60),
    items: items.map((it) => ({
      name: String(it.name || "Food").slice(0, 60),
      amount: String(it.amount || "").slice(0, 40),
      calories: num(it.calories), protein: num(it.protein), carbs: num(it.carbs), fat: num(it.fat),
    })),
  };
}

export class AIError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// ---------- Gemini ----------
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

function versionScore(name) {
  const m = name.match(/gemini-(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}
function newestFirst(list) {
  return list.sort((a, b) => versionScore(b) - versionScore(a) || a.length - b.length);
}

// Google's always-current aliases, used if we can't read the model list.
const FALLBACK_MODELS = { order: ["gemini-flash-lite-latest", "gemini-flash-latest"], fast: "gemini-flash-lite-latest" };

// Which models to try for chatting (fastest first) and which one turns answers into numbers.
export async function pickGeminiModels(key, onStatus = () => {}) {
  onStatus("Asking Google which models your key can use…");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: ctl.signal });
  } catch {
    if (ctl.signal.aborted) return { ...FALLBACK_MODELS };
    throw new AIError("network", "Couldn't reach Google. Check your internet and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new AIError("key", "Google says this key doesn't work. Copy it again from AI Studio and paste it here.");
  }
  if (!res.ok) return { ...FALLBACK_MODELS };
  const data = await res.json().catch(() => ({}));
  const names = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  const odd = /(preview|exp|image|tts|audio|live|thinking|embedding|vision|8b|latest|native|computer|robotics)/;
  const stable = names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !odd.test(n));
  const lite = newestFirst(stable.filter((n) => /lite/.test(n)))[0];
  const main = newestFirst(stable.filter((n) => !/lite/.test(n)))[0];
  const order = [main, lite].filter(Boolean);
  if (!order.length) return { ...FALLBACK_MODELS };
  return { order, fast: lite || main };
}

function thinkingFor(model) {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  return null;
}

// One request to Gemini. Switches off options this model refuses (thinking, search, JSON) and tries again.
async function callGemini(key, model, { system, contents, search = false, json = false, quick = false, timeoutMs = 30000 }) {
  const opts = { search, think: quick && !!thinkingFor(model), json };
  for (let attempt = 0; attempt < 4; attempt++) {
    const generationConfig = { temperature: 0.4 };
    if (opts.think) generationConfig.thinkingConfig = thinkingFor(model);
    if (opts.json) generationConfig.responseMimeType = "application/json";
    const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig };
    if (opts.search) body.tools = [{ google_search: {} }];

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res, data;
    try {
      res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      data = await res.json().catch(() => null);
    } catch {
      if (ctl.signal.aborted) throw new AIError("busy", "too slow");
      throw new AIError("network", "Couldn't reach Google. Check your internet and try again.");
    } finally {
      clearTimeout(timer);
    }
    const detail = data?.error?.message || "";
    if (res.status === 400) {
      if (opts.think && /think/i.test(detail)) { opts.think = false; continue; }
      if (opts.search && /(tool|search|ground)/i.test(detail)) { opts.search = false; continue; }
      if (opts.json && /(mime|json)/i.test(detail)) { opts.json = false; continue; }
    }
    if (res.status === 429) {
      if (opts.search && /(search|ground)/i.test(detail)) { opts.search = false; continue; }
      throw new AIError("limit", "free limit used up");
    }
    if (res.status === 402) throw new AIError("credit", "Your Gemini credit ran out. Top it up in AI Studio under Billing.");
    if ([500, 502, 503, 504].includes(res.status)) throw new AIError("busy", `overloaded (${res.status})`);
    if (res.status === 404 || /not found|not supported for generateContent/i.test(detail)) throw new AIError("model", "not available");
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(detail))) {
      throw new AIError("key", "Your Gemini key stopped working. Paste a fresh one in Settings.");
    }
    if (!res.ok) throw new AIError("other", `error ${res.status}: ${detail.slice(0, 120)}`);
    const cand = data?.candidates?.[0];
    if (!cand || cand.finishReason === "SAFETY") throw new AIError("other", "Gemini didn't want to answer that one");
    const text = (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
    if (!text) throw new AIError("busy", "empty answer");
    return { text, cand };
  }
  throw new AIError("other", "Gemini refused the request settings");
}

function sourcesOf(cand) {
  const seen = new Set();
  return (cand.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w && w.uri && !seen.has(w.title || w.uri) && seen.add(w.title || w.uri))
    .slice(0, 3)
    .map((w) => ({ title: String(w.title || "source").slice(0, 60), uri: String(w.uri) }));
}

function toContents(turns, photoDataUrl) {
  return turns.map((t, i) => {
    const parts = [];
    const photo = t.photo || (i === 0 ? photoDataUrl : null);
    if (photo) {
      const [head, b64] = photo.split(",");
      const mime = (head.match(/data:(.*?);/) || [])[1] || "image/jpeg";
      parts.push({ inline_data: { mime_type: mime, data: b64 } });
    }
    parts.push({ text: t.text || (t.role === "model" ? "…" : "Here's what I ate. What is it?") });
    return { role: t.role === "model" ? "model" : "user", parts };
  });
}

// ---------- pretend AI for testing (?demo) ----------
async function fakeChat(turns, photo) {
  await new Promise((r) => setTimeout(r, 700));
  const last = (turns[turns.length - 1]?.text || "").toLowerCase();
  if (turns.length > 1 && /half/.test(last)) {
    return normalise({ reply: "Got it, half a portion! I've halved everything.", meal: { name: "Chicken salad (half)", items: [
      { name: "Grilled chicken", amount: "60 g", calories: 99, protein: 19, carbs: 0, fat: 2 },
      { name: "Mixed leaves & veg", amount: "60 g", calories: 15, protein: 1, carbs: 3, fat: 0 },
      { name: "Olive oil dressing", amount: "1/2 tbsp", calories: 60, protein: 0, carbs: 0, fat: 7 },
    ] } });
  }
  if (/pizza/.test(last)) {
    return normalise({ reply: "Two slices of pizza, yum! I assumed medium slices of a margherita.", meal: { name: "Margherita pizza", items: [
      { name: "Margherita pizza", amount: "2 slices", calories: 540, protein: 22, carbs: 66, fat: 20 },
    ] } });
  }
  return { estimate: true, options: ["Bigger bowl", "Smaller bowl", "Normal bowl"], ...normalise({ reply: (photo ? "That looks like a **chicken salad** with a light dressing. " : "Sounds like a chicken salad! ") + "I guessed a normal bowl. Was it bigger or smaller?", meal: { name: "Chicken salad", items: [
    { name: "Grilled chicken", amount: "120 g", calories: 198, protein: 37, carbs: 0, fat: 4 },
    { name: "Mixed leaves & veg", amount: "120 g", calories: 30, protein: 2, carbs: 6, fat: 0 },
    { name: "Olive oil dressing", amount: "1 tbsp", calories: 119, protein: 0, carbs: 0, fat: 14 },
  ] } }) };
}

// turns: [{role:"user"|"model", text}]; the photo goes with the first turn.
// Step 1: chat with search (fastest model first). Step 2: turn the answer into numbers.
export async function askAI(turns, photoDataUrl, { demo = false, onStatus = () => {}, meal = null } = {}) {
  if (demo) return fakeChat(turns, photoDataUrl);
  const s = loadAISettings();
  const key = s.keys?.[s.provider];
  if (!key) throw new AIError("nokey", "Add your Gemini key in Settings first.");
  if (s.provider !== "gemini") throw new AIError("other", "Only Gemini works right now.");
  let models = s.models?.geminiSet;
  if (!models || !Array.isArray(models.order) || !models.fast) {
    models = await pickGeminiModels(key, onStatus);
    s.models = { ...(s.models || {}), geminiSet: models };
    saveAISettings(s);
  }

  // Step 1
  const report = [];
  const contents = toContents(turns, photoDataUrl);
  const plan = [...models.order.map((m) => [m, true]), [models.order[0], false]];
  let chat = null, chatModel = null;
  for (const [model, search] of plan) {
    onStatus(`${search ? "Asking" : "Asking without search,"} ${model}…`);
    try {
      chat = await callGemini(key, model, { system: CHAT_RULES, contents, search, timeoutMs: search ? 60000 : 40000 });
      chatModel = model;
      break;
    } catch (e) {
      report.push(`${model}${search ? "" : " (no search)"}: ${e.message}`);
      if (e.kind === "key" || e.kind === "credit" || e.kind === "network") throw withReport(e, report);
    }
  }
  if (!chat) throw withReport(new AIError("busy", "Gemini couldn't answer right now. Try again in a minute."), report);
  const reply = chat.text;
  const sources = sourcesOf(chat.cand);

  // Step 2
  onStatus("Counting the calories…");
  const transcript = [...turns, { role: "model", text: reply }].slice(-12)
    .map((t) => `${t.role === "model" ? "Munchkin" : "Person"}: ${t.photo ? "(sent a photo) " : ""}${t.text || (t.role === "model" ? "" : "(sent a photo)")}`).join("\n\n");
  const before = meal && meal.items?.length ? `\n\nPrevious numbers (may be outdated): ${JSON.stringify({ name: meal.name, items: meal.items })}` : "";
  let numbers = null;
  for (const model of [models.fast, chatModel]) {
    try {
      const r = await callGemini(key, model, {
        system: EXTRACT_RULES, json: true, quick: true, timeoutMs: 25000,
        contents: [{ role: "user", parts: [{ text: transcript + before }] }],
      });
      const parsed = cleanJSON(r.text);
      if (parsed) {
        const m = parsed.meal || parsed;
        numbers = normalise({ reply, meal: m });
        numbers.estimate = !!m.estimate;
        numbers.options = (Array.isArray(m.options) ? m.options : []).map((o) => String(o).slice(0, 40)).filter(Boolean).slice(0, 4);
        break;
      }
      report.push(`${model} (numbers): came out jumbled`);
    } catch (e) {
      report.push(`${model} (numbers): ${e.message}`);
    }
  }
  if (!numbers) {
    // Keep the chat answer even if counting failed; the old numbers stay.
    return { reply, sources, name: meal?.name || "Meal", items: meal?.items || [], countFailed: true };
  }
  return { ...numbers, reply, sources };
}

function withReport(e, report) {
  if (report.length) e.message = `${e.message}\n\nWhat happened:\n• ${report.join("\n• ")}`;
  return e;
}
