// Daily goals: works out calories and macros from body details, using the
// Mifflin-St Jeor formula (a standard way to estimate daily energy needs).

export const ACTIVITY = [
  ["sedentary", "Mostly sitting", "Desk job, no exercise. Pick this if you log workouts with the Exercise button.", 1.2],
  ["light", "Lightly active", "Exercise 1-3 days a week, about 30 min each", 1.375],
  ["moderate", "Active", "Exercise 3-5 days a week, 30-60 min each", 1.55],
  ["active", "Very active", "Hard exercise 6-7 days a week", 1.725],
  ["very", "Extra active", "Physical job plus training most days", 1.9],
];

// About 7,700 kcal ≈ 1 kg of body weight.
export const KCAL_PER_KG = 7700;
export const PACES = [
  ["loss3", "Faster weight loss", -0.75],
  ["loss2", "Weight loss", -0.5],
  ["loss1", "Mild weight loss", -0.25],
  ["keep", "Stay the same", 0],
  ["gain1", "Mild weight gain", 0.25],
  ["gain2", "Weight gain", 0.5],
];
const OLD_GOAL = { lose: "loss2", keep: "keep", gain: "gain1" };
export function paceOf(p) { return p.pace || OLD_GOAL[p.goal] || "keep"; }
export function safeMinimum(p) { return p.sex === "male" ? 1500 : 1200; }

export function maintenanceOf(p) {
  const age = Number(p.age), h = Number(p.height), w = Number(p.weight);
  if (!(age > 12 && age < 110 && h > 100 && h < 250 && w > 30 && w < 350)) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === "male" ? 5 : -161);
  const mult = (ACTIVITY.find((a) => a[0] === p.activity) || ACTIVITY[1])[3];
  return bmr * mult;
}

// Every pace with its calories; paces that would go under the safe minimum are marked.
export function paceOptions(p) {
  const tdee = maintenanceOf(p);
  if (!tdee) return null;
  return PACES.map(([id, label, kgWeek]) => {
    const raw = tdee + (kgWeek * KCAL_PER_KG) / 7;
    return { id, label, kgWeek, calories: Math.round(raw / 10) * 10, tooLow: raw < safeMinimum(p) };
  });
}

export function suggestGoals(p) {
  const tdee = maintenanceOf(p);
  if (!tdee) return null;
  const opts = paceOptions(p);
  let opt = opts.find((o) => o.id === paceOf(p)) || opts.find((o) => o.id === "keep");
  let cal = opt.tooLow ? Math.round(safeMinimum(p) / 10) * 10 : opt.calories;
  const w = Number(p.weight);
  let protein = Math.round(w * (opt.kgWeek === 0 ? 1.4 : 1.8));
  protein = Math.min(protein, Math.round((cal * 0.35) / 4));
  const fat = Math.round((cal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
  return { calories: cal, protein, carbs, fat, maintenance: Math.round(tdee / 10) * 10 };
}

// ---------- exercise ----------
// MET values (how much harder than resting) for easy / moderate / hard effort.
export const EXERCISES = [
  ["walk", "🚶 Walk", [3.0, 3.8, 5.0]],
  ["run", "🏃 Run", [7.0, 9.8, 11.5]],
  ["gym", "🏋️ Gym", [3.5, 5.0, 6.0]],
  ["yoga", "🧘 Yoga / pilates", [2.5, 3.0, 4.0]],
  ["dance", "💃 Dance", [4.5, 5.5, 7.3]],
  ["cycle", "🚴 Cycling", [4.0, 6.8, 10.0]],
  ["swim", "🏊 Swimming", [5.0, 7.0, 9.8]],
  ["clean", "🧹 Cleaning", [2.5, 3.3, 4.0]],
];
export const EFFORT = [["easy", "Easy"], ["moderate", "Moderate"], ["hard", "Hard"]];

// Extra calories burned on top of resting (so they aren't counted twice).
export function exerciseBurn(met, minutes, kg) {
  return Math.max(0, Math.round((met - 1) * (kg || 65) * (minutes / 60)));
}

// Steps above what your chosen activity level already includes.
const BASE_STEPS = { sedentary: 3000, light: 5000, moderate: 7000, active: 9000, very: 11000 };
export function stepsBurn(steps, p) {
  const kg = Number(p?.weight) || 65;
  const base = BASE_STEPS[p?.activity] ?? 4000;
  const extra = Math.max(0, Number(steps) - base);
  return { burned: Math.round(extra * 0.04 * (kg / 70)), base };
}
