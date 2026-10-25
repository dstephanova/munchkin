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
- Be realistic, not perfect: these are estimates. Never lecture about diet.`;

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

// Picks the newest regular "flash" model this key can use, so the app keeps working as Google renames models.
export async function pickGeminiModel(key) {
  let res;
  try {
    res = await fetch(`${GEMINI}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  } catch {
    throw new AIError("network", "Couldn't reach Google. Check your internet and try again.");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new AIError("key", "Google says this key doesn't work. Copy it again from AI Studio and paste it here.");
  }
  if (!res.ok) throw new AIError("other", `Google answered with an error (${res.status}). Try again in a minute.`);
  const data = await res.json();
  const names = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  const bad = /(lite|preview|exp|image|tts|audio|live|thinking|embedding|vision|8b|latest)/;
  const flash = names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !bad.test(n));
  flash.sort((a, b) => versionScore(b) - versionScore(a) || a.length - b.length);
  if (flash[0]) return flash[0];
  const anyFlash = names.filter((n) => n.includes("flash") && !/(image|tts|audio|live|embedding)/.test(n));
  anyFlash.sort((a, b) => versionScore(b) - versionScore(a));
  if (anyFlash[0]) return anyFlash[0];
  if (names[0]) return names[0];
  throw new AIError("other", "This key can't use any Gemini model that reads photos.");
}

async function geminiChat(key, model, turns, photoDataUrl) {
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
  let res;
  try {
    res = await fetch(`${GEMINI}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    });
  } catch {
    throw new AIError("network", "Couldn't reach Google. Check your internet and try again.");
  }
  if (res.status === 429) throw new AIError("limit", "You've hit Gemini's free limit for now. Try again in a little while.");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    let detail = "";
    try { detail = (await res.json()).error?.message || ""; } catch {}
    if (/api key/i.test(detail)) throw new AIError("key", "Your Gemini key stopped working. Paste a fresh one in Settings.");
    if (res.status === 404 || /not found|not supported/i.test(detail)) throw new AIError("model", "model");
    throw new AIError("other", "Gemini couldn't read that. Try a clearer photo or describe it in words.");
  }
  if (res.status === 404) throw new AIError("model", "model");
  if (!res.ok) throw new AIError("other", `Gemini had a hiccup (${res.status}). Try again in a minute.`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  if (!cand || cand.finishReason === "SAFETY") throw new AIError("other", "Gemini didn't want to answer that one. Try describing it in words.");
  const text = (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  const parsed = cleanJSON(text);
  if (!parsed) throw new AIError("other", "Gemini's answer came out jumbled. Tap send again.");
  return normalise(parsed);
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
export async function askAI(turns, photoDataUrl, { demo = false } = {}) {
  if (demo) return fakeChat(turns, photoDataUrl);
  const s = loadAISettings();
  const key = s.keys?.[s.provider];
  if (!key) throw new AIError("nokey", "Add your Gemini key in Settings first.");
  if (s.provider !== "gemini") throw new AIError("other", "Only Gemini works right now.");
  let model = s.models?.gemini;
  if (!model) {
    model = await pickGeminiModel(key);
    s.models = { ...(s.models || {}), gemini: model };
    saveAISettings(s);
  }
  try {
    return await geminiChat(key, model, turns, photoDataUrl);
  } catch (e) {
    if (e.kind !== "model") throw e;
    // The saved model was retired: pick a fresh one and try once more.
    model = await pickGeminiModel(key);
    s.models = { ...(s.models || {}), gemini: model };
    saveAISettings(s);
    return geminiChat(key, model, turns, photoDataUrl);
  }
}
