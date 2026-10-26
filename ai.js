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

const INSTRUCTIONS = `You are Munchkin, a friendly cat who helps people log food in a food diary app.
The person shows you something they ate (a photo, a description, or both) and may correct you afterwards.
Work out what the food is, estimate portion sizes, and estimate nutrition.

Always reply with ONLY a JSON object, no other text, in exactly this shape:
{"reply": "1-3 short, warm sentences: what you think it is and your main assumption about portion size. If something important is unclear, ask ONE short question.",
 "meal": {"name": "short meal name, max 5 words",
          "items": [{"name": "food item", "amount": "e.g. 150 g, 1 slice, 1 cup", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}]}}

Rules:
- calories in kcal, protein/carbs/fat in grams, whole numbers.
- List every item separately (e.g. bread, cheese, drink).
- When the person corrects you, return the FULL updated meal, not only the change.
- Use their corrections as facts (if they say 200 g, use 200 g).
- If the photo is a nutrition label, read it, and use the per-portion values for the amount they had (ask if unknown).
- If it is not food, say so kindly and return "items": [].
- Be realistic, not perfect: these are estimates. Never lecture about diet.
- You can search Google. When the person names a brand, shop, packaged product, restaurant or chain dish, SEARCH for its real nutrition label and package size and use those numbers (e.g. half of a 600 g pack = 300 g). Say briefly that you checked online. Don't search for plain basic foods like an apple or rice.
- Even after searching, your final answer must be ONLY the JSON object.`;

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function versionScore(name) {
  const m = name.match(/gemini-(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}
function newestFirst(list) {
  return list.sort((a, b) => versionScore(b) - versionScore(a) || a.length - b.length);
}

// Picks which Gemini models to try, fastest first:
// newest "lite" model, newest regular "flash", then the older, very reliable 2.5 models.
const FALLBACK_MODELS = { order: ["gemini-2.5-flash-lite", "gemini-2.5-flash"] };
export async function pickGeminiModels(key, onStatus = () => {}) {
  onStatus("Asking Google which models your key can use…");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: ctl.signal });
  } catch {
    if (ctl.signal.aborted) {
      onStatus("Google didn't list the models in time, using the usual ones…");
      return { ...FALLBACK_MODELS };
    }
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
  const order = [lite, main, "gemini-2.5-flash-lite", "gemini-2.5-flash"]
    .filter((n, i, a) => n && a.indexOf(n) === i && (names.length === 0 || names.includes(n)));
  return order.length ? { order } : { ...FALLBACK_MODELS };
}

function thinkingFor(model) {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  return null;
}

async function geminiChat(key, model, turns, photoDataUrl, timeoutMs) {
  const contents = turns.map((t, i) => {
    const parts = [];
    if (i === 0 && photoDataUrl) {
      const [head, b64] = photoDataUrl.split(",");
      const mime = (head.match(/data:(.*?);/) || [])[1] || "image/jpeg";
      parts.push({ inline_data: { mime_type: mime, data: b64 } });
    }
    parts.push({ text: t.role === "model" ? (t.raw || t.text) : (t.text || "Here's what I ate. What is it?") });
    return { role: t.role === "model" ? "model" : "user", parts };
  });

  // Options we may have to switch off if this model doesn't support them.
  const opts = { search: true, think: !!thinkingFor(model), json: false };
  for (let attempt = 0; attempt < 4; attempt++) {
    const generationConfig = { temperature: 0.4 };
    if (opts.think) generationConfig.thinkingConfig = thinkingFor(model);
    if (opts.json) generationConfig.responseMimeType = "application/json";
    const body = { systemInstruction: { parts: [{ text: INSTRUCTIONS }] }, contents, generationConfig };
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
      if (ctl.signal.aborted) throw new AIError("busy", `Gemini took too long to answer (${model}).`);
      throw new AIError("network", "Couldn't reach Google. Check your internet and try again.");
    } finally {
      clearTimeout(timer);
    }
    const detail = data?.error?.message || "";
    if (res.status === 400) {
      if (opts.think && /think/i.test(detail)) { opts.think = false; continue; }
      if (opts.search && /(tool|search|ground)/i.test(detail)) { opts.search = false; opts.json = true; continue; }
    }
    if (res.status === 429) {
      if (opts.search && /(search|ground)/i.test(detail)) { opts.search = false; opts.json = true; continue; }
      throw new AIError("limit", `Gemini's free limit is used up for now (${model}).`);
    }
    if ([500, 502, 503, 504].includes(res.status)) throw new AIError("busy", `Gemini is overloaded right now (${res.status}, ${model}).`);
    if (res.status === 404 || /not found|not supported for generateContent/i.test(detail)) throw new AIError("model", `Model ${model} isn't available.`);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      if (/api key|permission|unauth/i.test(detail)) throw new AIError("key", "Your Gemini key stopped working. Paste a fresh one in Settings.");
      throw new AIError("other", `Gemini couldn't read that: ${detail || res.status}`);
    }
    if (!res.ok) throw new AIError("busy", `Gemini had a hiccup (${res.status}, ${model}).`);
    const cand = data?.candidates?.[0];
    if (!cand || cand.finishReason === "SAFETY") throw new AIError("other", "Gemini didn't want to answer that one. Try describing it in words.");
    const text = (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    const parsed = cleanJSON(text);
    if (!parsed) throw new AIError("busy", "Gemini's answer came out jumbled.");
    const result = normalise(parsed);
    const seen = new Set();
    result.sources = (cand.groundingMetadata?.groundingChunks || [])
      .map((c) => c.web)
      .filter((w) => w && w.uri && !seen.has(w.title || w.uri) && seen.add(w.title || w.uri))
      .slice(0, 3)
      .map((w) => ({ title: String(w.title || "source").slice(0, 60), uri: String(w.uri) }));
    return result;
  }
  throw new AIError("other", "Gemini couldn't handle this request.");
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
  return normalise({ reply: (photo ? "That looks like a chicken salad with a light dressing. " : "Sounds like a chicken salad! ") + "I guessed a normal bowl, so tell me if it was bigger or smaller.", meal: { name: "Chicken salad", items: [
    { name: "Grilled chicken", amount: "120 g", calories: 198, protein: 37, carbs: 0, fat: 4 },
    { name: "Mixed leaves & veg", amount: "120 g", calories: 30, protein: 2, carbs: 6, fat: 0 },
    { name: "Olive oil dressing", amount: "1 tbsp", calories: 119, protein: 0, carbs: 0, fat: 14 },
  ] } });
}

// turns: [{role:"user"|"model", text, raw?}]; photo is sent with the first turn.
// Tries the main model, then the lighter backup model, so a busy Google server doesn't leave you stuck.
export async function askAI(turns, photoDataUrl, { demo = false, onStatus = () => {} } = {}) {
  if (demo) return fakeChat(turns, photoDataUrl);
  const s = loadAISettings();
  const key = s.keys?.[s.provider];
  if (!key) throw new AIError("nokey", "Add your Gemini key in Settings first.");
  if (s.provider !== "gemini") throw new AIError("other", "Only Gemini works right now.");
  let models = s.models?.geminiSet;
  const refresh = async () => {
    models = await pickGeminiModels(key, onStatus);
    s.models = { ...(s.models || {}), geminiSet: models };
    saveAISettings(s);
  };
  if (!models || !Array.isArray(models.order)) await refresh();
  let lastErr;
  const tried = new Set();
  for (let i = 0; i < models.order.length && i < 4; i++) {
    const model = models.order[i];
    if (tried.has(model)) continue;
    tried.add(model);
    onStatus(i === 0 ? `Asking ${model}…` : `That was slow, trying ${model}…`);
    try {
      return await geminiChat(key, model, turns, photoDataUrl, 30000);
    } catch (e) {
      lastErr = e;
      if (e.kind === "model" || e.kind === "busy" || e.kind === "limit") continue;
      throw e;
    }
  }
  throw new AIError(lastErr?.kind === "limit" ? "limit" : "busy",
    (lastErr?.kind === "limit" ? "Gemini's free limit is used up for now. Try again later." : "Gemini is too busy right now. Try again in a minute.")
    + ` (${lastErr?.message || ""})`);
}
