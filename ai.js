// Talking to the food-guessing AI.
// Each person's key lives only on their own device (localStorage), never in the cloud diary.

const KEY_STORE = "munchkin.ai";

export const PROVIDERS = [
  { id: "gemini", name: "Gemini", note: "Free key from Google AI Studio", ready: true },
  { id: "openai", name: "ChatGPT", note: "Paid key from platform.openai.com", ready: true },
  { id: "claude", name: "Claude", note: "Paid key from console.anthropic.com", ready: true },
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
- Use simple formatting: short paragraphs, "* " bullet lines and **bold** are fine; no tables.
- What the app can do from this chat (and nothing else): add food or drinks to the diary, move an entry to another meal or day, and add drinks to the water counter. If the person asks for one of these, confirm in one short sentence (e.g. "Done, added to dinner!", "Added 500 ml to your water!") and the app does it.
- Water counter rules: every non-alcoholic drink counts toward water (water, sparkling water, tea, coffee, juice, milk, soda, smoothies; alcohol-free beer too). Alcohol (beer, wine, spirits, cocktails) does NOT count toward water, only its calories count. Drinks with calories are also logged as food.
- If one message lists food for DIFFERENT meals (e.g. "pizza for dinner and a mousse as a snack"), give the numbers for each meal separately. The app files each one into its own meal.
- Never claim you did anything else (setting goals, logging exercise, changing settings, reminders). If asked, say kindly that you can't do that from the chat and where to find it in the app.`;

// Step 2: a quick, cheap model turns that answer into numbers for the calorie card, plus tap-answers.
const EXTRACT_RULES = `You turn a food-diary chat into numbers. Read the chat below between a person and Munchkin (a food helper).
Using Munchkin's LAST answer (and earlier messages for context), list the FULL meal the person ate with Munchkin's estimates.
- If a range or several options are given and the person hasn't chosen yet, use the middle / most typical one and set "estimate": true.
- If a macro is missing, estimate it sensibly. If nothing edible was eaten, return "items": [].
- "questions": for EACH question Munchkin's last answer asks the person (max 3), give the question shortened (max 40 characters) and 2-4 very short tap-answers they could send back (max 30 characters each). Use the person's language. If Munchkin asks nothing, [].
- "name": short meal name in the person's language, max 5 words.
- "water_ml": total millilitres of drinks in the person's LAST message that count toward water: every non-alcoholic drink (water, sparkling water, tea, coffee, juice, milk, soda, alcohol-free beer). Alcohol does NOT count. Assume 250 ml per glass or cup if no size is given. 0 if none, and 0 when they are only correcting an earlier message.
- "water_only": true only if the LAST message is just plain water / sparkling water / unsweetened tea with no calories and no food.
- If the person's LAST message lists food for MORE THAN ONE meal (e.g. "pizza for dinner and a mousse as a snack"): put in "items" only the food for THIS entry's meal (given below); if none of it is for this meal, use the first meal mentioned and set "action" to {"add": true, "slot": that meal, "day": null}. Put each OTHER meal in "others": [{"slot": "breakfast" | "lunch" | "dinner" | "snack", "day": "today" | "yesterday" | "YYYY-MM-DD" | null, "name": "short name", "items": [...]}]. Otherwise "others": [].
- "label": ONLY if a photo in the chat is a nutrition label you can read: {"per100": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}, "pack_grams": null or the package weight in grams, "product": "product name from the package"}. Otherwise null.
- "action": ONLY if the person's LAST message asks to add / log / save the food, or to move it to a meal or day, return {"add": true, "slot": "breakfast" | "lunch" | "dinner" | "snack" | null, "day": "today" | "yesterday" | "YYYY-MM-DD" | null}. Otherwise null.
Reply with ONLY this JSON:
{"name": "", "estimate": false, "action": null, "others": [], "label": null, "water_ml": 0, "water_only": false, "questions": [{"question": "Which pack?", "options": ["500 g pack", "1 kg pack"]}], "items": [{"name": "food item", "amount": "e.g. 300 g", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}]}`;

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
    const pics = [i === 0 ? photoDataUrl : null, ...(t.photos || []), t.photo].filter(Boolean);
    for (const photo of pics) {
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
  const slotWord = ["breakfast", "lunch", "dinner", "snack"].find((w) => last.includes(w));
  if (/water/.test(last)) {
    return { ...normalise({ reply: "Added 500 ml to your water! 💧", meal: { name: "Water", items: [] } }), water: { ml: 500, only: true } };
  }
  if (/dinner/.test(last) && /snack/.test(last)) {
    return { ...normalise({ reply: "Pizza for dinner: about 670 kcal. Fruit mousse as a snack: about 130 kcal.", meal: { name: "Pizza", items: [{ name: "Pizza", amount: "3 slices", calories: 670, protein: 31, carbs: 75, fat: 28 }] } }),
      action: { add: true, slot: "dinner", day: null },
      others: [{ slot: "snack", day: null, name: "Fruit mousse", items: [{ name: "Fruit mousse", amount: "1 pouch", calories: 132, protein: 1, carbs: 28, fat: 1 }] }] };
  }
  if (/\b(add|move|log)\b/.test(last) && slotWord) {
    return { ...normalise({ reply: `Done, added to ${slotWord}!`, meal: { name: "Croissant", items: [{ name: "Croissant", amount: "1 medium", calories: 270, protein: 5, carbs: 31, fat: 14 }] } }),
      action: { add: true, slot: slotWord, day: /yesterday/.test(last) ? "yesterday" : "today" } };
  }
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
  return { estimate: true, questions: [
    { question: "How big was the bowl?", options: ["Bigger bowl", "Normal bowl", "Smaller bowl"] },
    { question: "Any dressing?", options: ["Olive oil", "Caesar", "No dressing"] },
  ], ...normalise({ reply: (photo ? "That looks like a **chicken salad** with a light dressing. " : "Sounds like a chicken salad! ") + "I guessed a normal bowl. Was it bigger or smaller?", meal: { name: "Chicken salad", items: [
    { name: "Grilled chicken", amount: "120 g", calories: 198, protein: 37, carbs: 0, fat: 4 },
    { name: "Mixed leaves & veg", amount: "120 g", calories: 30, protein: 2, carbs: 6, fat: 0 },
    { name: "Olive oil dressing", amount: "1 tbsp", calories: 119, protein: 0, carbs: 0, fat: 14 },
  ] } }) };
}

// turns: [{role:"user"|"model", text}]; the photo goes with the first turn.
// Step 1: chat with search (fastest model first). Step 2: turn the answer into numbers.
// ---------- ChatGPT (OpenAI) ----------
const OPENAI = "https://api.openai.com/v1";
function openaiErr(status, detail) {
  if (status === 401) return new AIError("key", "Your ChatGPT key doesn't work. Paste a fresh one in Settings.");
  if (status === 429 && /quota|billing|credit/i.test(detail)) return new AIError("credit", "Your OpenAI credit ran out. Top it up on platform.openai.com (Billing).");
  if (status === 429) return new AIError("limit", "rate limit, slow down a little");
  if (status >= 500) return new AIError("busy", `overloaded (${status})`);
  if (status === 404 || /model/i.test(detail) && status === 400) return new AIError("model", "not available");
  return new AIError("other", `error ${status}: ${detail.slice(0, 120)}`);
}
async function timedFetch(url, opts, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    const data = await res.json().catch(() => null);
    return { res, data };
  } catch {
    if (ctl.signal.aborted) throw new AIError("busy", "too slow");
    throw new AIError("network", "Couldn't reach the AI. Check your internet and try again.");
  } finally {
    clearTimeout(timer);
  }
}
const openaiEngine = {
  label: "ChatGPT",
  async pick(key) {
    const { res, data } = await timedFetch(`${OPENAI}/models`, { headers: { Authorization: `Bearer ${key}` } }, 15000);
    if (!res.ok) throw openaiErr(res.status, data?.error?.message || "");
    const ids = (data.data || []).map((m) => m.id).filter((id) => /^gpt-\d/.test(id) && !/(audio|realtime|search|transcribe|tts|image|codex|chat-latest|\d{4}-\d{2}-\d{2})/.test(id));
    const score = (id) => { const m = id.match(/gpt-(\d+)(?:\.(\d+))?/); return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0; };
    const best = (re) => ids.filter((i) => re.test(i)).sort((a, b) => score(b) - score(a) || a.length - b.length)[0];
    const mini = best(/-mini$/) || "gpt-4o-mini";
    const nano = best(/-nano$/) || mini;
    return { order: [mini], fast: nano };
  },
  async chat(key, model, { system, turns, photo, search, timeoutMs }) {
    const input = mergeTurns(turns).map((t, i) => {
      const content = [];
      if (t.role === "user") {
        for (const p of [i === 0 ? photo : null, ...(t.photos || []), t.photo].filter(Boolean)) content.push({ type: "input_image", image_url: p });
        content.push({ type: "input_text", text: t.text || "Here's what I ate. What is it?" });
      } else content.push({ type: "output_text", text: t.text || "…" });
      return { role: t.role === "model" ? "assistant" : "user", content };
    });
    const body = { model, instructions: system, input };
    if (search) body.tools = [{ type: "web_search" }];
    const { res, data } = await timedFetch(`${OPENAI}/responses`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
    const detail = data?.error?.message || "";
    if (!res.ok) {
      if (search && res.status === 400 && /tool|search/i.test(detail)) return this.chat(key, model, { system, turns, photo, search: false, timeoutMs });
      throw openaiErr(res.status, detail);
    }
    let text = "", sources = [];
    for (const item of data.output || []) {
      if (item.type !== "message") continue;
      for (const c of item.content || []) {
        if (c.type !== "output_text") continue;
        text += c.text || "";
        for (const a of c.annotations || []) if (a.type === "url_citation" && a.url) sources.push({ title: a.title || new URL(a.url).hostname, uri: a.url });
      }
    }
    if (!text.trim()) throw new AIError("busy", "empty answer");
    return { text: text.trim(), sources: dedupe(sources) };
  },
  async json(key, model, { system, text, timeoutMs }) {
    const body = { model, instructions: system, input: [{ role: "user", content: [{ type: "input_text", text: text + "\n\nReply in JSON." }] }], text: { format: { type: "json_object" } } };
    const { res, data } = await timedFetch(`${OPENAI}/responses`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
    if (!res.ok) throw openaiErr(res.status, data?.error?.message || "");
    return (data.output || []).flatMap((i) => i.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
  },
};

// ---------- Claude (Anthropic) ----------
const ANTHROPIC = "https://api.anthropic.com/v1";
function claudeHeaders(key) {
  return { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "content-type": "application/json" };
}
function claudeErr(status, detail) {
  if (status === 401 || status === 403) return new AIError("key", "Your Claude key doesn't work. Paste a fresh one in Settings.");
  if (/credit balance/i.test(detail)) return new AIError("credit", "Your Claude API credit ran out. Top it up on console.anthropic.com (Billing).");
  if (status === 429) return new AIError("limit", "rate limit, slow down a little");
  if (status === 529 || status >= 500) return new AIError("busy", `overloaded (${status})`);
  if (status === 404) return new AIError("model", "not available");
  return new AIError("other", `error ${status}: ${detail.slice(0, 120)}`);
}
const claudeEngine = {
  label: "Claude",
  async pick(key) {
    const { res, data } = await timedFetch(`${ANTHROPIC}/models?limit=100`, { headers: claudeHeaders(key) }, 15000);
    if (!res.ok) throw claudeErr(res.status, data?.error?.message || "");
    const ids = (data.data || []).map((m) => m.id); // newest first
    const sonnet = ids.find((i) => /sonnet/.test(i)) || ids[0];
    const haiku = ids.find((i) => /haiku/.test(i)) || sonnet;
    if (!sonnet) throw new AIError("other", "This key can't use any Claude model.");
    return { order: [sonnet], fast: haiku };
  },
  async chat(key, model, { system, turns, photo, search, timeoutMs }) {
    const messages = mergeTurns(turns).map((t, i) => {
      const content = [];
      if (t.role === "user") {
        for (const p of [i === 0 ? photo : null, ...(t.photos || []), t.photo].filter(Boolean)) {
          const [head, b64] = p.split(",");
          content.push({ type: "image", source: { type: "base64", media_type: (head.match(/data:(.*?);/) || [])[1] || "image/jpeg", data: b64 } });
        }
      }
      content.push({ type: "text", text: t.text || (t.role === "model" ? "…" : "Here's what I ate. What is it?") });
      return { role: t.role === "model" ? "assistant" : "user", content };
    });
    const body = { model, max_tokens: 1500, system, messages };
    if (search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    const { res, data } = await timedFetch(`${ANTHROPIC}/messages`, { method: "POST", headers: claudeHeaders(key), body: JSON.stringify(body) }, timeoutMs);
    const detail = data?.error?.message || "";
    if (!res.ok) {
      if (search && res.status === 400 && /tool|search/i.test(detail)) return this.chat(key, model, { system, turns, photo, search: false, timeoutMs });
      throw claudeErr(res.status, detail);
    }
    let text = ""; const sources = [];
    for (const b of data.content || []) {
      if (b.type === "text") {
        text += b.text || "";
        for (const c of b.citations || []) if (c.url) sources.push({ title: c.title || new URL(c.url).hostname, uri: c.url });
      }
    }
    if (!text.trim()) throw new AIError("busy", "empty answer");
    return { text: text.trim(), sources: dedupe(sources) };
  },
  async json(key, model, { system, text, timeoutMs }) {
    const body = { model, max_tokens: 1200, system, messages: [{ role: "user", content: text }] };
    const { res, data } = await timedFetch(`${ANTHROPIC}/messages`, { method: "POST", headers: claudeHeaders(key), body: JSON.stringify(body) }, timeoutMs);
    if (!res.ok) throw claudeErr(res.status, data?.error?.message || "");
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  },
};

// ---------- Gemini, in the same shape ----------
const geminiEngine = {
  label: "Gemini",
  pick: (key, onStatus) => pickGeminiModels(key, onStatus),
  async chat(key, model, { system, turns, photo, search, timeoutMs }) {
    const r = await callGemini(key, model, { system, contents: toContents(turns, photo), search, timeoutMs });
    return { text: r.text, sources: sourcesOf(r.cand) };
  },
  async json(key, model, { system, text, timeoutMs }) {
    const r = await callGemini(key, model, { system, json: true, quick: true, timeoutMs, contents: [{ role: "user", parts: [{ text }] }] });
    return r.text;
  },
};

const ENGINES = { gemini: geminiEngine, openai: openaiEngine, claude: claudeEngine };

function mergeTurns(turns) {
  const out = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) {
      last.text = [last.text, t.text].filter(Boolean).join("\n\n");
      last.photos = [...(last.photos || []), ...(t.photos || []), t.photo].filter(Boolean);
    } else out.push({ ...t, photos: [...(t.photos || [])] });
  }
  return out;
}
function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => !seen.has(s.title) && seen.add(s.title)).slice(0, 3);
}

// Finds the chosen AI, its key and models (remembered after the first time).
async function setup(onStatus = () => {}) {
  const s = loadAISettings();
  const provider = ENGINES[s.provider] ? s.provider : "gemini";
  const engine = ENGINES[provider];
  const key = s.keys?.[provider];
  if (!key) throw new AIError("nokey", `Add your ${engine.label} key in Settings first.`);
  const slot = provider === "gemini" ? "geminiSet" : provider;
  let models = s.models?.[slot];
  if (!models || !Array.isArray(models.order) || !models.fast) {
    models = await engine.pick(key, onStatus);
    s.models = { ...(s.models || {}), [slot]: models };
    saveAISettings(s);
  }
  return { engine, key, models };
}
export async function testProvider(onStatus) {
  const s = loadAISettings();
  const slot = s.provider === "gemini" ? "geminiSet" : s.provider;
  if (s.models) { delete s.models[slot]; saveAISettings(s); }
  const r = await askAI([{ role: "user", text: "one medium apple" }], null, { onStatus });
  const m = loadAISettings().models?.[slot];
  return { ...r, models: m };
}

// turns: [{role:"user"|"model", text, photos?}]; the first photo goes with the first turn.
// Step 1: chat (with web search). Step 2: a quick model turns the answer into numbers.
export async function askAI(turns, photoDataUrl, { demo = false, onStatus = () => {}, meal = null } = {}) {
  if (demo) return fakeChat(turns, photoDataUrl);
  const { engine, key, models } = await setup(onStatus);

  const report = [];
  const plan = [...models.order.map((m) => [m, true]), [models.order[0], false]];
  let chat = null, chatModel = null;
  for (const [model, search] of plan) {
    onStatus(`${search ? "Asking" : "Asking without search,"} ${model}…`);
    try {
      chat = await engine.chat(key, model, { system: CHAT_RULES + slotContext(meal), turns, photo: photoDataUrl, search, timeoutMs: search ? 60000 : 40000 });
      chatModel = model;
      break;
    } catch (e) {
      report.push(`${model}${search ? "" : " (no search)"}: ${e.message}`);
      if (e.kind === "key" || e.kind === "credit" || e.kind === "network") throw withReport(e, report);
    }
  }
  if (!chat) throw withReport(new AIError("busy", `${engine.label} couldn't answer right now. Try again in a minute.`), report);
  const reply = chat.text;
  const sources = chat.sources || [];

  onStatus("Counting the calories…");
  const transcript = [...turns, { role: "model", text: reply }].slice(-12)
    .map((t) => `${t.role === "model" ? "Munchkin" : "Person"}: ${t.photo || t.photos?.length ? "(sent photos) " : ""}${t.text || (t.role === "model" ? "" : "(sent a photo)")}`).join("\n\n");
  const todayStr = new Date().toISOString().slice(0, 10);
  const before = (meal && meal.items?.length ? `\n\nPrevious numbers (may be outdated): ${JSON.stringify({ name: meal.name, items: meal.items })}` : "") + (meal?.slot && !meal.askOnly ? `\n\nThis entry's meal: ${meal.slot}.` : "") + `\n\nToday's date: ${todayStr}.`;
  let numbers = null;
  for (const model of [models.fast, chatModel].filter((m, i, a) => a.indexOf(m) === i)) {
    try {
      const text = await engine.json(key, model, { system: EXTRACT_RULES, text: transcript + before, timeoutMs: 25000 });
      const parsed = cleanJSON(text);
      if (parsed) { numbers = readNumbers(parsed, reply); break; }
      report.push(`${model} (numbers): came out jumbled`);
    } catch (e) {
      report.push(`${model} (numbers): ${e.message}`);
    }
  }
  if (!numbers) return { reply, sources, name: meal?.name || "Meal", items: meal?.items || [], countFailed: true };
  return { ...numbers, reply, sources };
}

// Tell the chat which meal this entry is already filed under, so it never asks.
function slotContext(meal) {
  if (!meal?.slot || meal.askOnly) return "";
  const word = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "a snack" }[meal.slot] || meal.slot;
  return `\n- This entry is already filed as ${word}. Never ask which meal it is. If the person says it was a different meal, just confirm; the app moves it.`;
}

function readNumbers(parsed, reply) {
  const m = parsed.meal || parsed;
  const numbers = normalise({ reply, meal: m });
  numbers.estimate = !!m.estimate;
  const ml = Math.round(Number(m.water_ml) || 0);
  numbers.water = ml > 0 && ml <= 5000 ? { ml, only: !!m.water_only } : null;
  const act = m.action;
  if (act && typeof act === "object" && (act.add || act.slot || act.day)) {
    numbers.action = {
      add: !!act.add,
      slot: ["breakfast", "lunch", "dinner", "snack"].includes(act.slot) ? act.slot : null,
      day: typeof act.day === "string" ? act.day : null,
    };
  }
  const lb = m.label;
  const kcal100 = Number(lb?.per100?.calories);
  numbers.label = lb && kcal100 > 0 && kcal100 < 1000 ? {
    per100: { calories: Math.round(kcal100), protein: Number(lb.per100.protein) || 0, carbs: Number(lb.per100.carbs) || 0, fat: Number(lb.per100.fat) || 0 },
    packGrams: Number(lb.pack_grams) > 0 ? Math.round(Number(lb.pack_grams)) : null,
    product: String(lb.product || "").slice(0, 60),
  } : null;
  const SL = ["breakfast", "lunch", "dinner", "snack"];
  numbers.others = (Array.isArray(m.others) ? m.others : [])
    .filter((o) => o && SL.includes(o.slot) && Array.isArray(o.items) && o.items.length)
    .slice(0, 3)
    .map((o) => ({ slot: o.slot, day: typeof o.day === "string" ? o.day : null, ...normalise({ reply: "", meal: { name: o.name || "Meal", items: o.items } }) }))
    .map(({ slot, day, name, items }) => ({ slot, day, name, items }));
  numbers.questions = (Array.isArray(m.questions) ? m.questions : [])
    .map((q) => ({
      question: String(q?.question || "").slice(0, 60),
      options: (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).slice(0, 40)).filter(Boolean).slice(0, 4),
    }))
    .filter((q) => q.options.length)
    .slice(0, 3);
  return numbers;
}

function withReport(e, report) {
  if (report.length) e.message = `${e.message}\n\nWhat happened:\n• ${report.join("\n• ")}`;
  return e;
}

// ---------- barcode the food database doesn't know: look it up online ----------
const BARCODE_RULES = `You look up packaged food products by their barcode (EAN/UPC number), using Google Search.
Search for the exact barcode number (also try it in quotes, and with the word "баркод" or "EAN"). Shop and producer pages often list it.
If you find the product with this exact barcode, give: product name, brand, package size, and nutrition per 100 g or 100 ml (kcal, protein, carbs, fat) from the label as shown by a shop or the producer.
If you can't find this exact barcode, or there's no nutrition info, say NOT FOUND. Never guess a different product.`;
const BARCODE_JSON = `Turn this answer into JSON. found = false if it says NOT FOUND or gives no calories per 100 g / 100 ml.
Reply with ONLY: {"found": false, "name": "", "brand": "", "pack_grams": null, "per100": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}}`;
export async function askBarcode(code, { demo = false, onStatus = () => {} } = {}) {
  if (demo) {
    await new Promise((r) => setTimeout(r, 600));
    return code === "3800018645630" ? { code, name: "Demo yogurt drink", brand: "Demo", image: "", packGrams: 330, packText: "330 g", servingGrams: null, servingText: "", per100: { calories: 62, protein: 3, carbs: 9, fat: 1.5 }, source: "ai" } : null;
  }
  const { engine, key, models } = await setup(onStatus);
  let text = null;
  for (const model of models.order.slice(0, 2)) {
    try { text = (await engine.chat(key, model, { system: BARCODE_RULES, turns: [{ role: "user", text: `Barcode: ${code}` }], search: true, timeoutMs: 45000 })).text; break; }
    catch (e) { if (e.kind === "key" || e.kind === "credit" || e.kind === "network") throw e; }
  }
  if (!text || /NOT FOUND/i.test(text) && !/kcal/i.test(text)) return null;
  for (const model of [models.fast, models.order[0]].filter((m, i, a) => a.indexOf(m) === i)) {
    try {
      const j = cleanJSON(await engine.json(key, model, { system: BARCODE_JSON, text, timeoutMs: 20000 }));
      if (!j) continue;
      const kcal = Number(j.per100?.calories);
      if (!j.found || !(kcal > 0 && kcal < 1000)) return null;
      const pg = Number(j.pack_grams) > 0 ? Math.round(Number(j.pack_grams)) : null;
      return { code, name: String(j.name || "Product").slice(0, 60), brand: String(j.brand || "").slice(0, 40), image: "",
        packGrams: pg, packText: pg ? `${pg} g` : "", servingGrams: null, servingText: "",
        per100: { calories: Math.round(kcal), protein: Number(j.per100.protein) || 0, carbs: Number(j.per100.carbs) || 0, fat: Number(j.per100.fat) || 0 }, source: "ai" };
    } catch { /* try the next model */ }
  }
  return null;
}

// ---------- exercise estimate ----------
const EXERCISE_RULES = `You estimate calories burned by exercise for a food diary app.
The person describes an activity. Work out a short name, the duration in minutes (if not said, assume a typical session), and the calories burned ON TOP OF resting (net, i.e. (MET - 1) x kg x hours), for their body weight.
Reply with ONLY JSON: {"name": "short name in the person's language, max 4 words", "minutes": 0, "burned": 0, "note": "one short sentence on what you assumed, in the person's language"}`;

export async function askExercise(text, kg, { demo = false } = {}) {
  if (demo) {
    await new Promise((r) => setTimeout(r, 500));
    return { name: "Tennis", minutes: 60, burned: Math.round(6 * kg), note: "Assumed a friendly singles game." };
  }
  const { engine, key, models } = await setup();
  let lastErr;
  for (const model of [models.fast, ...models.order].filter((m, i, a) => a.indexOf(m) === i)) {
    try {
      const out = await engine.json(key, model, { system: EXERCISE_RULES, text: `Body weight: ${kg} kg.\nActivity: ${text}`, timeoutMs: 25000 });
      const j = cleanJSON(out);
      if (j) return { name: String(j.name || "Exercise").slice(0, 40), minutes: Math.max(0, Math.round(Number(j.minutes) || 0)), burned: Math.max(0, Math.round(Number(j.burned) || 0)), note: String(j.note || "").slice(0, 160) };
    } catch (e) {
      lastErr = e;
      if (e.kind === "key" || e.kind === "credit" || e.kind === "network") throw e;
    }
  }
  throw lastErr || new AIError("busy", "Munchkin couldn't estimate that right now. Try again.");
}
