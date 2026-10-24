// Pure scoring functions: points, streaks, badges, date night weeks, rewards.

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return dateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

export function goalsFor(goals, owner, date) {
  return Object.entries(goals)
    .map(([id, g]) => ({ id, ...g }))
    .filter(g => g.owner === owner && (!date || !g.since || g.since <= date))
    .sort((a, b) => (a.created || 0) - (b.created || 0));
}

export function goalMet(goal, value) {
  if (goal.type === 'check') return value === true;
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return goal.compare === 'lte' ? n <= Number(goal.target) : n >= Number(goal.target);
}

export function dayScore(goals, log) {
  let earned = 0;
  let possible = 0;
  for (const g of goals) {
    const pts = Number(g.points) || 0;
    possible += pts;
    if (goalMet(g, log?.values?.[g.id])) earned += pts;
  }
  return { earned, possible, pct: possible ? earned / possible : 0 };
}

function logFor(logs, pid, date) {
  return logs[`${pid}_${date}`];
}

// Per-day scores for one person across the month, up to and including `today`.
export function personDays(data, pid, today) {
  const month = data.settings.main?.month;
  if (!month) return [];
  return monthDays(month).map(date => {
    const log = logFor(data.logs, pid, date);
    const score = dayScore(goalsFor(data.goals, pid, date), log);
    return { date, log, ...score, future: date > today };
  });
}

export function streaks(days, threshold) {
  const past = days.filter(d => !d.future);
  const good = d => d.log && d.possible > 0 && d.pct >= threshold;
  let best = 0;
  let run = 0;
  for (const d of past) {
    run = good(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // Today doesn't break the current streak until it's over.
  let i = past.length - 1;
  if (i >= 0 && !good(past[i])) i--;
  let current = 0;
  while (i >= 0 && good(past[i])) { current++; i--; }
  return { current, best };
}

export function personSummary(data, pid, today) {
  const settings = data.settings.main || {};
  const threshold = (Number(settings.goodDayPct) || 80) / 100;
  const days = personDays(data, pid, today);
  const total = days.reduce((s, d) => s + d.earned, 0);
  const { current, best } = streaks(days, threshold);
  const todayEntry = days.find(d => d.date === today);
  const perfectDay = days.some(d => !d.future && d.possible > 0 && d.pct === 1);
  const target = Number(data.people[pid]?.target) || 0;

  const badges = [
    { name: 'First check-in', icon: '👟', earned: days.some(d => d.earned > 0) },
    { name: '100% day', icon: '💯', earned: perfectDay },
    { name: '7-day streak', icon: '🔥', earned: best >= 7 },
    { name: '14-day streak', icon: '⚡', earned: best >= 14 },
    { name: 'Perfect November', icon: '🏆', earned: days.length > 0 && best >= days.length },
    { name: 'Hit monthly target', icon: '🎯', earned: target > 0 && total >= target },
  ];

  return { days, total, target, current, best, today: todayEntry, badges, threshold };
}

// Calendar weeks (Sunday to Saturday) that overlap the month.
export function monthWeeks(month) {
  const days = monthDays(month);
  const weeks = [];
  let week = null;
  for (const d of days) {
    if (!week || parseDate(d).getDay() === 0) {
      week = { start: d, end: d };
      weeks.push(week);
    }
    week.end = d;
  }
  return weeks;
}

export function dateNightWeeks(data, today) {
  const settings = data.settings.main || {};
  if (!settings.month) return [];
  const perWeek = Number(settings.dateNightsPerWeek) || 0;
  const nights = Object.values(data.dateNights);
  return monthWeeks(settings.month).map(w => {
    const count = nights.filter(n => n.date >= w.start && n.date <= w.end).length;
    return { ...w, count, perWeek, met: count >= perWeek, done: w.end < today, current: w.start <= today && today <= w.end };
  });
}

export function coupleSummary(data, today) {
  const settings = data.settings.main || {};
  const month = settings.month || '';
  const people = Object.keys(data.people).sort();
  const personTotals = people.map(pid => personSummary(data, pid, today).total);
  const nightsThisMonth = Object.values(data.dateNights).filter(n => n.date?.startsWith(month)).length;
  const datePoints = nightsThisMonth * (Number(settings.dateNightPoints) || 0);
  const combined = personTotals.reduce((a, b) => a + b, 0) + datePoints;
  const weeks = dateNightWeeks(data, today);
  const rewards = Object.entries(data.rewards)
    .map(([id, r]) => ({ id, ...r, unlocked: combined >= Number(r.threshold) }))
    .sort((a, b) => Number(a.threshold) - Number(b.threshold));
  const allWeeksMet = weeks.length > 0 && weeks.every(w => w.met);
  return { combined, datePoints, nightsThisMonth, weeks, rewards, allWeeksMet };
}
