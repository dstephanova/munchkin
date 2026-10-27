// Daily goals: works out calories and macros from body details, using the
// Mifflin-St Jeor formula (a standard way to estimate daily energy needs).

export const ACTIVITY = [
  ["sedentary", "Mostly sitting", "Desk job, little exercise", 1.2],
  ["light", "Lightly active", "Walks or exercise 1-3 days a week", 1.375],
  ["moderate", "Active", "Exercise 3-5 days a week", 1.55],
  ["active", "Very active", "Hard exercise 6-7 days a week", 1.725],
  ["very", "Extra active", "Physical job plus training", 1.9],
];
export const GOAL = [
  ["lose", "Lose weight"],
  ["keep", "Stay the same"],
  ["gain", "Gain weight"],
];

export function suggestGoals(p) {
  const age = Number(p.age), h = Number(p.height), w = Number(p.weight);
  if (!(age > 12 && age < 110 && h > 100 && h < 250 && w > 30 && w < 350)) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === "male" ? 5 : -161);
  const mult = (ACTIVITY.find((a) => a[0] === p.activity) || ACTIVITY[1])[3];
  const tdee = bmr * mult;
  let cal = p.goal === "lose" ? tdee - 500 : p.goal === "gain" ? tdee + 300 : tdee;
  // Never suggest less than a safe minimum.
  const floor = p.sex === "male" ? 1500 : 1200;
  cal = Math.max(cal, floor);
  cal = Math.round(cal / 10) * 10;
  let protein = Math.round(w * (p.goal === "keep" ? 1.4 : 1.8));
  protein = Math.min(protein, Math.round((cal * 0.35) / 4));
  const fat = Math.round((cal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
  return { calories: cal, protein, carbs, fat, maintenance: Math.round(tdee / 10) * 10 };
}
