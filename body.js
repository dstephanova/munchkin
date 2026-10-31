// Weight trend and menstrual cycle helpers (pure functions, no app state).

const DAY = 86400000;
const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return toIso(d); };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const median = (arr) => { const v = [...arr].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// ---------- weight ----------
// Smoothed trend: each weigh-in moves the trend 20% of the way, so water jumps barely move it.
export function weightTrend(entries) {
  const list = [...entries].filter((e) => e.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  let t = null;
  return list.map((e) => { t = t == null ? e.kg : t + 0.2 * (e.kg - t); return { ...e, trend: Math.round(t * 10) / 10 }; });
}
export function weeklyChange(trended) {
  if (trended.length < 2) return null;
  const last = trended[trended.length - 1];
  const older = [...trended].reverse().find((e) => daysBetween(e.date, last.date) >= 6);
  if (!older) return null;
  return Math.round(((last.trend - older.trend) * 7 / daysBetween(older.date, last.date)) * 10) / 10;
}

// ---------- cycle ----------
// periodDays: Set of YYYY-MM-DD days marked as period (from Health Connect or tapped in by hand).
export function cycleInfo(periodDays, manualStarts = []) {
  const days = new Set(periodDays);
  const starts = [];
  for (const d of [...days].sort()) if (!days.has(addDays(d, -1))) starts.push(d);
  for (const s of manualStarts) if (!starts.some((x) => Math.abs(daysBetween(x, s)) < 10)) starts.push(s);
  starts.sort();
  // merge starts closer than 10 days (spotting, double entries)
  const merged = [];
  for (const s of starts) if (!merged.length || daysBetween(merged[merged.length - 1], s) >= 10) merged.push(s);
  const gaps = []; // gaps under 21 days are usually a wrong tap, not a real cycle
  for (let i = 1; i < merged.length; i++) { const g = daysBetween(merged[i - 1], merged[i]); if (g >= 21 && g <= 45) gaps.push(g); }
  const runs = merged.map((s) => { let n = 0; while (days.has(addDays(s, n))) n++; return n; }).filter((n) => n >= 2 && n <= 10);
  const cycleLen = gaps.length ? Math.round(median(gaps.slice(-6))) : 28;
  const periodLen = runs.length ? Math.round(median(runs.slice(-6))) : 5;
  return { starts: merged, cycleLen, periodLen, learned: gaps.length > 0, days };
}

// Which phase a day is in, plus the predicted next period.
export function phaseOn(date, info) {
  const { starts, cycleLen, periodLen, days } = info;
  const last = [...starts].reverse().find((s) => s <= date);
  if (!last) return null;
  const day = daysBetween(last, date) + 1;
  const next = addDays(last, cycleLen);
  const ov = cycleLen - 14;
  let phase;
  if (days.has(date) || day <= periodLen) phase = "period";
  else if (day > cycleLen + 7) phase = "late";
  else if (Math.abs(day - ov) <= 1) phase = "ovulation";
  else if (day < ov) phase = "follicular";
  else if (cycleLen - day < 5 && day <= cycleLen + 2) phase = "pre";
  else if (day > cycleLen + 2) phase = "late";
  else phase = "luteal";
  return { phase, day, next, daysToNext: daysBetween(date, next), cycleLen };
}

// Days to colour on a calendar or chart: real period days, plus predicted ones.
export function periodMarks(info, from, to) {
  const marks = {};
  for (const d of info.days) if (d >= from && d <= to) marks[d] = "period";
  for (const s of info.starts) for (let i = 0; i < info.periodLen; i++) { const d = addDays(s, i); if (d >= from && d <= to && !marks[d]) marks[d] = "period"; }
  const last = info.starts[info.starts.length - 1];
  if (last) {
    for (let k = 1; k <= 3; k++) {
      const s = addDays(last, info.cycleLen * k);
      for (let i = 0; i < info.periodLen; i++) { const d = addDays(s, i); if (d >= from && d <= to && !marks[d]) marks[d] = "predicted"; }
    }
  }
  return marks;
}

export const PHASE = {
  period: { emoji: "🩸", name: "Period",
    text: (p) => `Day ${p.day} of your cycle. Water weight is often still up for the first days and usually drops as your period ends. Feeling tired or snacky is normal.` },
  follicular: { emoji: "🌱", name: "After your period",
    text: () => "Often your lightest days: the water from before your period is gone. Good days to compare weigh-ins." },
  ovulation: { emoji: "🌸", name: "Around ovulation",
    text: () => "Some people feel a little bloated for a day or two now, maybe a small bump on the scale. It passes quickly." },
  luteal: { emoji: "🌙", name: "Second half of your cycle",
    text: () => "Your body uses a bit more energy now (roughly 100–200 kcal a day) and can start holding on to water. Feeling hungrier is normal." },
  pre: { emoji: "🌧️", name: "Before your period",
    text: (p) => `${p.daysToNext > 0 ? `Your period is due in about ${p.daysToNext} day${p.daysToNext === 1 ? "" : "s"}` : "Your period is due about now"}. Many people hold an extra 0.5–2 kg of water now. That's not fat, and it usually goes a few days after your period starts.` },
  late: { emoji: "⏳", name: "Period later than expected",
    text: (p) => `Munchkin expected your period around ${toDate(p.next).toLocaleDateString(undefined, { day: "numeric", month: "long" })}. Predictions are only estimates; tap "My period started" when it comes.` },
};

// ---------- a short note for every day of the cycle ----------
// Written for a 28-day cycle; longer or shorter cycles stretch the first half,
// because the second half (after ovulation) is about 14 days for almost everyone.
const DAY_NOTES = [
  null,
  "Energy is often lower today and the scale may still read high from water. Totally normal.",
  "Often the heaviest-feeling day. The water from before your period is still there, so don't trust the scale this week.",
  "Iron helps now: meat, eggs, lentils, beans or spinach. Bloating usually starts to ease.",
  "Water weight starts to drop. A gentle walk can help with cramps.",
  "Usually the last heavy day. The scale often starts coming back down.",
  "Energy tends to come back as your period ends. A good day for a workout you enjoy.",
  "Appetite is often lower in this part of your cycle, so sticking to your goal can feel easier.",
  "Often your lightest days: the extra water is gone. A great morning to weigh in.",
  "Many people feel stronger and more motivated now, and muscles recover well.",
  "Still in your lightest-days window. Weigh-ins from this week compare best with each other.",
  "Energy and mood are often at their best around now.",
  "Ovulation is coming up. Some people notice more energy, some a little bloating.",
  "A small bump on the scale for a day or two around ovulation is normal. It's water.",
  "Around ovulation. A mild twinge on one side or some bloating can happen and passes quickly.",
  "The second half of your cycle starts, and your body begins using a little more energy.",
  "Your body burns roughly 100–200 kcal more a day in this half, so feeling a bit hungrier is normal.",
  "Protein and fibre help you stay full now that your appetite starts creeping up.",
  "You may feel a little warmer than usual. Your body temperature is slightly higher in this half.",
  "Your body can start holding on to water slowly. Salty food makes it more noticeable.",
  "Sweet cravings may start. A planned treat feels better than snacking all day.",
  "Sleep can get lighter this week, and being tired makes hunger louder.",
  "Hungrier than usual? It's real: your body is using more energy right now.",
  "Bloating may start. Drinking enough water actually helps your body let go of extra water.",
  "The scale may creep up 0.5–2 kg over the next days. That's water, not fat.",
  "PMS days for many: mood dips, cravings, tender breasts. Be kind to yourself.",
  (p) => `Period in about ${p.daysToNext} days. Extra water is often at its peak now.`,
  (p) => `Period in about ${p.daysToNext} day${p.daysToNext === 1 ? "" : "s"}. Don't judge your progress by today's weigh-in.`,
  () => "Period expected about now. Your weight usually drops back a few days after it starts.",
];
export function dayNote(p, info) {
  if (!p) return null;
  if (p.phase === "late") return PHASE.late.text(p);
  const L = p.cycleLen, F = Math.max(7, L - 14), d = p.day;
  let t;
  if (p.phase === "period") t = Math.min(d, 5);
  else if (d <= F) t = Math.max(6, 1 + Math.round(((d - 1) * 13) / (F - 1)));
  else t = Math.min(28, 14 + (d - F));
  if (L - d < 3 && L - d >= 0 && p.phase !== "period") t = 28 - (L - d); // last days always talk about the coming period
  const n = DAY_NOTES[t];
  return typeof n === "function" ? n(p) : n;
}
