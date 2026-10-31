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
  const gaps = [];
  for (let i = 1; i < merged.length; i++) { const g = daysBetween(merged[i - 1], merged[i]); if (g >= 20 && g <= 45) gaps.push(g); }
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
  else if (cycleLen - day < 5 && day <= cycleLen) phase = "pre";
  else if (day > cycleLen) phase = "late";
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
    text: (p) => `Your period is due in about ${p.daysToNext} day${p.daysToNext === 1 ? "" : "s"}. Many people hold an extra 0.5–2 kg of water now. That's not fat, and it usually goes a few days after your period starts.` },
  late: { emoji: "⏳", name: "Period later than expected",
    text: (p) => `Munchkin expected your period around ${p.next}. Predictions are only estimates; tap "My period started" when it comes.` },
};
