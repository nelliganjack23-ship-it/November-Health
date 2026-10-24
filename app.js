import { initDb, data, put, remove, mode } from './db.js';
import * as S from './scoring.js';

const CATEGORIES = {
  exercise: '🏃 Exercise',
  nutrition: '🥗 Nutrition',
  sleep: '😴 Sleep',
  water: '💧 Water',
  habits: '✨ Habits',
  other: '⭐ Other',
};

const state = {
  tab: location.hash.slice(1) || 'today',
  me: localStorage.getItem('nh:me') || 'p1',
  date: S.todayStr(),
  charts: [],
};

const view = document.getElementById('view');

// ---------- helpers ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function people() {
  return Object.entries(data.people).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.id.localeCompare(b.id));
}

function personName(pid) {
  return pid === 'couple' ? 'Couple' : data.people[pid]?.name || pid;
}

function settings() {
  return data.settings.main || {};
}

function prettyDate(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return S.parseDate(s).toLocaleDateString(undefined, opts);
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function bar(pct, color) {
  const w = Math.max(0, Math.min(1, pct)) * 100;
  return `<div class="bar" style="--pc:${color}"><div style="width:${w}%"></div></div>`;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------- seed data for first run ----------

const STARTER_GOALS = [
  { name: 'Workout 30+ min', category: 'exercise', type: 'check', points: 10 },
  { name: 'Steps', category: 'exercise', type: 'number', target: 8000, unit: 'steps', compare: 'gte', points: 5 },
  { name: 'Healthy home-cooked meals', category: 'nutrition', type: 'number', target: 2, unit: 'meals', compare: 'gte', points: 5 },
  { name: 'Sleep', category: 'sleep', type: 'number', target: 7, unit: 'hrs', compare: 'gte', points: 5 },
  { name: 'Water', category: 'water', type: 'number', target: 8, unit: 'glasses', compare: 'gte', points: 5 },
  { name: 'No alcohol', category: 'habits', type: 'check', points: 5 },
];

const STARTER_IDEAS = [
  'Sunrise or sunset hike', 'Cook a new healthy recipe together', 'Farmers market + make lunch',
  'Yoga or pilates class together', 'Bike ride to a coffee shop', 'Rock climbing gym',
  'Picnic in the park', 'Ice skating', 'Spa night at home', 'Try a new dance class',
  'Walk + stargazing', 'Smoothie bowl breakfast date',
];

const STARTER_REWARDS = [
  { name: 'Fancy dinner out', threshold: 800 },
  { name: 'Couples massage / spa day', threshold: 1500 },
  { name: 'Weekend getaway', threshold: 2200 },
];

async function seedIfEmpty() {
  if (data.settings.main) return;
  const now = Date.now();
  await put('settings', 'main', { month: '2026-11', dateNightsPerWeek: 1, dateNightPoints: 10, goodDayPct: 80 });
  await put('people', 'p1', { name: 'Jack', color: '#2f7de1', target: 900 });
  await put('people', 'p2', { name: 'Partner', color: '#e14f8a', target: 900 });
  for (const pid of ['p1', 'p2']) {
    for (const [i, g] of STARTER_GOALS.entries()) {
      await put('goals', `${pid}_starter${i}`, { ...g, owner: pid, created: now + i });
    }
  }
  for (const [i, text] of STARTER_IDEAS.entries()) {
    await put('dateIdeas', `starter${i}`, { text, done: false, created: now + i });
  }
  for (const [i, r] of STARTER_REWARDS.entries()) {
    await put('rewards', `starter${i}`, r);
  }
}

// ---------- views ----------

function personSwitcher() {
  return `<div class="seg">${people().map(p => `
    <button data-action="me" data-id="${p.id}" class="${p.id === state.me ? 'on' : ''}" style="--pc:${p.color}">${esc(p.name)}</button>`).join('')}
  </div>`;
}

function viewToday() {
  const me = state.me;
  const color = data.people[me]?.color;
  const goals = S.goalsFor(data.goals, me, state.date);
  const log = data.logs[`${me}_${state.date}`];
  const score = S.dayScore(goals, log);
  const isToday = state.date === S.todayStr();

  let html = personSwitcher();
  html += `<div class="row daynav">
    <button data-action="day" data-delta="-1">‹</button>
    <strong>${isToday ? 'Today · ' : ''}${prettyDate(state.date)}</strong>
    <button data-action="day" data-delta="1">›</button>
  </div>`;
  html += `<div class="card"><div class="row spread"><div><div class="big">${score.earned}<span class="muted small"> / ${score.possible} pts</span></div>
    <div class="muted small">${Math.round(score.pct * 100)}% of today's points</div></div>
    ${!isToday ? '<button data-action="gotoday">Jump to today</button>' : ''}</div>${bar(score.pct, color)}</div>`;

  if (!goals.length) {
    return html + `<div class="card center muted">No goals yet for ${esc(personName(me))}. Add some in <a href="#settings">Settings</a>.</div>`;
  }

  for (const [cat, label] of Object.entries(CATEGORIES)) {
    const list = goals.filter(g => (g.category || 'other') === cat);
    if (!list.length) continue;
    html += `<div class="cat">${label}</div>`;
    for (const g of list) {
      const v = log?.values?.[g.id];
      const met = S.goalMet(g, v);
      if (g.type === 'check') {
        html += `<div class="goal ${met ? 'met' : ''}">
          <button class="check" data-action="toggle" data-goal="${g.id}" aria-label="Toggle ${esc(g.name)}">${met ? '✓' : ''}</button>
          <div class="grow"><div class="name">${esc(g.name)}</div><div class="pts">${g.points} pts</div></div>
        </div>`;
      } else {
        const rule = `${g.compare === 'lte' ? '≤' : '≥'} ${esc(g.target)} ${esc(g.unit || '')}`;
        html += `<div class="goal ${met ? 'met' : ''}">
          <div class="grow"><div class="name">${esc(g.name)}</div><div class="pts">Goal ${rule} · ${g.points} pts</div></div>
          <input type="number" inputmode="decimal" step="any" data-action="num" data-goal="${g.id}" value="${v ?? ''}" placeholder="0">
          <span class="muted small">${esc(g.unit || '')}</span>
        </div>`;
      }
    }
  }
  html += `<div class="cat">📝 Note</div>
    <textarea rows="2" data-action="note" placeholder="How did today go?">${esc(log?.note || '')}</textarea>`;
  return html;
}

function viewTogether() {
  const today = S.todayStr();
  const couple = S.coupleSummary(data, today);
  let html = '<div class="grid2">';
  for (const p of people()) {
    const s = S.personSummary(data, p.id, today);
    const todayPct = s.today ? Math.round(s.today.pct * 100) + '%' : '–';
    html += `<div class="card person-card" style="--pc:${p.color}">
      <h3>${esc(p.name)}</h3>
      <div class="big">${s.total}<span class="muted small"> / ${s.target || '–'} pts</span></div>
      ${bar(s.target ? s.total / s.target : 0, p.color)}
      <div class="row spread" style="margin-top:10px">
        <div class="stat"><b>🔥 ${s.current}</b><span>streak</span></div>
        <div class="stat"><b>${s.best}</b><span>best streak</span></div>
        <div class="stat"><b>${todayPct}</b><span>today</span></div>
      </div>
      <div class="badges">${s.badges.map(b => `<span class="badge ${b.earned ? 'on' : ''}" title="${esc(b.name)}">${b.icon} ${esc(b.name)}</span>`).join('')}</div>
    </div>`;
  }
  html += '</div>';

  const nextReward = couple.rewards.find(r => !r.unlocked);
  const thisWeek = couple.weeks.find(w => w.current);
  html += `<div class="card" style="border-top:5px solid var(--couple)">
    <h3>💑 Together</h3>
    <div class="row spread">
      <div class="stat"><b>${couple.combined}</b><span>combined pts</span></div>
      <div class="stat"><b>${couple.nightsThisMonth}</b><span>date nights</span></div>
      <div class="stat"><b>${thisWeek ? `${thisWeek.count}/${thisWeek.perWeek}` : '–'}</b><span>dates this week</span></div>
    </div>
    ${nextReward ? `<p class="small">Next reward: <b>${esc(nextReward.name)}</b> at ${nextReward.threshold} pts (${Math.max(0, nextReward.threshold - couple.combined)} to go)</p>${bar(couple.combined / nextReward.threshold, 'var(--couple)')}` : couple.rewards.length ? '<p class="small">🎉 All rewards unlocked!</p>' : ''}
    ${couple.allWeeksMet ? '<div class="badges"><span class="badge on">🌙 Date night every week</span></div>' : ''}
  </div>`;

  const recent = Object.values(data.logs)
    .filter(l => l.updatedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  html += `<div class="card"><h3>Recent check-ins</h3>`;
  if (!recent.length) html += '<p class="muted small">Nothing logged yet.</p>';
  html += '<ul class="feed">' + recent.map(l => {
    const sc = S.dayScore(S.goalsFor(data.goals, l.person, l.date), l);
    return `<li><b style="color:${data.people[l.person]?.color}">${esc(personName(l.person))}</b> · ${prettyDate(l.date)} · ${sc.earned}/${sc.possible} pts${l.note ? ` — <span class="muted">${esc(l.note)}</span>` : ''}</li>`;
  }).join('') + '</ul></div>';
  return html;
}

function heatmap(p, today) {
  const s = S.personSummary(data, p.id, today);
  if (!s.days.length) return '';
  const offset = S.parseDate(s.days[0].date).getDay();
  let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
  cells += '<div class="cell empty"></div>'.repeat(offset);
  for (const d of s.days) {
    const num = Number(d.date.slice(-2));
    const cls = ['cell', d.future ? 'future' : '', d.date === today ? 'today' : ''].join(' ');
    const style = !d.future && d.log && d.possible ? `background:${hexToRgba(p.color, 0.15 + 0.85 * d.pct)};color:${d.pct > 0.55 ? '#fff' : 'inherit'}` : '';
    const title = d.log ? `${d.earned}/${d.possible} pts` : 'Not logged';
    cells += `<button class="${cls}" style="${style}" title="${title}" data-action="openday" data-id="${p.id}" data-date="${d.date}">${num}</button>`;
  }
  return `<div class="card"><div class="row spread"><h3 style="color:${p.color}">${esc(p.name)}</h3>
    <span class="muted small">🔥 ${s.current} · best ${s.best}</span></div>
    <div class="heat">${cells}</div>
    <div class="legend">Less ${[0.15, 0.4, 0.65, 1].map(a => `<i style="background:${hexToRgba(p.color, a)}"></i>`).join('')} More · good day = ${Math.round(s.threshold * 100)}%+</div></div>`;
}

function viewCalendar() {
  const today = S.todayStr();
  const month = settings().month;
  const title = month ? S.parseDate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  return `<h2>${title}</h2><p class="muted small">Tap a day to view or edit it.</p>` + people().map(p => heatmap(p, today)).join('');
}

function viewStats() {
  let html = `<div class="card"><h3>Points vs. target</h3><div class="chart-box"><canvas id="chart-points"></canvas></div></div>`;
  for (const p of people()) {
    const numGoals = S.goalsFor(data.goals, p.id).filter(g => g.type === 'number');
    for (const g of numGoals) {
      html += `<div class="card"><h3><span style="color:${p.color}">${esc(p.name)}</span> · ${esc(g.name)} <span class="muted small">(goal ${g.compare === 'lte' ? '≤' : '≥'} ${esc(g.target)} ${esc(g.unit || '')})</span></h3>
        <div class="chart-box"><canvas id="chart-${p.id}-${g.id}"></canvas></div></div>`;
    }
  }
  return html;
}

function drawStats() {
  if (!window.Chart) return;
  const today = S.todayStr();
  const month = settings().month;
  if (!month) return;
  const days = S.monthDays(month);
  const labels = days.map(d => Number(d.slice(-2)));
  const datasets = [];
  for (const p of people()) {
    const s = S.personSummary(data, p.id, today);
    let run = 0;
    datasets.push({
      label: p.name, borderColor: p.color, backgroundColor: p.color, tension: 0.25,
      data: s.days.map(d => d.future ? null : (run += d.earned)),
    });
    if (s.target) {
      datasets.push({
        label: `${p.name} target pace`, borderColor: hexToRgba(p.color, 0.45), borderDash: [6, 4], pointRadius: 0,
        data: days.map((_, i) => Math.round(s.target * (i + 1) / days.length)),
      });
    }
  }
  addChart('chart-points', { type: 'line', data: { labels, datasets }, options: chartOptions() });

  for (const p of people()) {
    for (const g of S.goalsFor(data.goals, p.id).filter(x => x.type === 'number')) {
      const values = days.map(d => {
        const v = data.logs[`${p.id}_${d}`]?.values?.[g.id];
        return v === undefined || v === null || v === '' ? null : Number(v);
      });
      addChart(`chart-${p.id}-${g.id}`, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: g.name, data: values, borderColor: p.color, backgroundColor: p.color, spanGaps: true, tension: 0.25 },
            { label: 'Goal', data: days.map(() => Number(g.target)), borderColor: '#1f9d63', borderDash: [6, 4], pointRadius: 0 },
          ],
        },
        options: chartOptions(),
      });
    }
  }
}

function chartOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { title: { display: true, text: 'Day' } }, y: { beginAtZero: true } },
  };
}

function addChart(id, config) {
  const el = document.getElementById(id);
  if (el) state.charts.push(new Chart(el, config));
}

function viewDates() {
  const today = S.todayStr();
  const couple = S.coupleSummary(data, today);
  const ideas = Object.entries(data.dateIdeas).map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.done - b.done) || (a.created || 0) - (b.created || 0));
  const nights = Object.entries(data.dateNights).map(([id, x]) => ({ id, ...x })).sort((a, b) => b.date.localeCompare(a.date));
  const openIdeas = ideas.filter(i => !i.done);

  let html = `<div class="card"><h3>🌙 Log a date night</h3>
    <form data-form="datenight" class="row wrap">
      <input type="date" name="date" value="${today}" required>
      <input class="grow" name="idea" list="idea-list" placeholder="What did you do?" required>
      <datalist id="idea-list">${openIdeas.map(i => `<option value="${esc(i.text)}">`).join('')}</datalist>
      <button class="primary">Add</button>
    </form>
    <p class="muted small">Each date night is worth ${settings().dateNightPoints || 0} couple points. Goal: ${settings().dateNightsPerWeek || 0} per week.</p>
    <div class="weeks">${couple.weeks.map(w => `<div class="week ${w.met ? 'met' : ''} ${w.current ? 'current' : ''}">
      ${prettyDate(w.start, { month: 'short', day: 'numeric' })}–${Number(w.end.slice(-2))}<br>${w.count}/${w.perWeek}${w.met ? ' ✓' : ''}</div>`).join('')}</div>
  </div>`;

  html += `<div class="card"><h3>Date nights so far</h3>`;
  html += nights.length ? `<ul class="list">${nights.map(n => `<li><span class="grow"><b>${prettyDate(n.date)}</b> · ${esc(n.idea)}</span>
    <button class="link danger" data-action="del" data-col="dateNights" data-id="${n.id}">✕</button></li>`).join('')}</ul>` : '<p class="muted small">None yet. Plan one!</p>';
  html += '</div>';

  html += `<div class="card"><h3>💡 Healthy date ideas</h3><ul class="list">${ideas.map(i => `<li class="${i.done ? 'done' : ''}">
      <input type="checkbox" data-action="ideadone" data-id="${i.id}" ${i.done ? 'checked' : ''}>
      <span class="txt grow">${esc(i.text)}</span>
      <button class="link danger" data-action="del" data-col="dateIdeas" data-id="${i.id}">✕</button></li>`).join('')}</ul>
    <form data-form="idea" class="row" style="margin-top:8px"><input class="grow" name="text" placeholder="Add an idea" required><button>Add</button></form></div>`;

  html += `<div class="card"><h3>🎁 Rewards</h3><p class="muted small">Unlocked by combined points: ${couple.combined} so far (includes ${couple.datePoints} from date nights).</p>`;
  html += couple.rewards.map(r => `<div class="reward ${r.unlocked ? 'unlocked' : ''}">
      <div class="row spread small"><span class="title"><b>${esc(r.name)}</b></span><span class="muted">${r.threshold} pts</span></div>
      ${bar(couple.combined / r.threshold, r.unlocked ? 'var(--good)' : 'var(--couple)')}</div>`).join('') || '<p class="muted small">Add rewards in Settings.</p>';
  html += '</div>';
  return html;
}

function goalEditor(g) {
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${g.category === k ? 'selected' : ''}>${v}</option>`).join('');
  const isNum = g.type === 'number';
  return `<form class="goal-edit" data-form="goal" data-id="${g.id || ''}" data-owner="${g.owner}">
    <input name="name" value="${esc(g.name || '')}" placeholder="Goal name" required class="full">
    <select name="category">${catOpts}</select>
    <select name="type" data-action="goaltype">
      <option value="check" ${!isNum ? 'selected' : ''}>Checkbox</option>
      <option value="number" ${isNum ? 'selected' : ''}>Number</option>
    </select>
    <label class="field">Points<input type="number" name="points" value="${g.points ?? 5}" min="0" required></label>
    <div class="full row num-fields" ${isNum ? '' : 'hidden'}>
      <select name="compare"><option value="gte" ${g.compare !== 'lte' ? 'selected' : ''}>at least</option><option value="lte" ${g.compare === 'lte' ? 'selected' : ''}>at most</option></select>
      <input type="number" step="any" name="target" value="${esc(g.target ?? '')}" placeholder="Target" class="grow">
      <input name="unit" value="${esc(g.unit || '')}" placeholder="Unit (hrs, steps)" class="grow">
    </div>
    <div class="full row spread">
      <button class="primary">${g.id ? 'Save' : 'Add goal'}</button>
      ${g.id ? `<button type="button" class="link danger" data-action="del" data-col="goals" data-id="${g.id}">Delete</button>` : ''}
    </div>
  </form>`;
}

function viewSettings() {
  const st = settings();
  let html = '';
  for (const p of people()) {
    const goals = S.goalsFor(data.goals, p.id);
    html += `<div class="card person-card" style="--pc:${p.color}">
      <form data-form="person" data-id="${p.id}" class="row wrap">
        <label class="field grow">Name<input name="name" value="${esc(p.name)}" required></label>
        <label class="field">Color<input type="color" name="color" value="${p.color}"></label>
        <label class="field">Monthly target<input type="number" name="target" value="${p.target ?? 0}" min="0" style="width:100px"></label>
        <button class="primary">Save</button>
      </form>
      <h3 style="margin-top:14px">${esc(p.name)}'s goals</h3>
      ${goals.map(goalEditor).join('') || '<p class="muted small">No goals yet.</p>'}
      <details style="margin-top:10px"><summary>➕ Add a goal</summary>${goalEditor({ owner: p.id, type: 'check', category: 'exercise' })}</details>
    </div>`;
  }

  const rewards = Object.entries(data.rewards).map(([id, r]) => ({ id, ...r })).sort((a, b) => a.threshold - b.threshold);
  html += `<div class="card"><h3>🎁 Rewards</h3>
    ${rewards.map(r => `<form data-form="reward" data-id="${r.id}" class="row" style="margin-bottom:6px">
      <input name="name" value="${esc(r.name)}" class="grow" required>
      <input type="number" name="threshold" value="${r.threshold}" min="0" style="width:90px" required>
      <button>Save</button><button type="button" class="link danger" data-action="del" data-col="rewards" data-id="${r.id}">✕</button>
    </form>`).join('')}
    <form data-form="reward" class="row"><input name="name" placeholder="New reward" class="grow" required>
      <input type="number" name="threshold" placeholder="Pts" min="0" style="width:90px" required><button>Add</button></form>
  </div>`;

  html += `<div class="card"><h3>General</h3>
    <form data-form="settings" class="row wrap">
      <label class="field">Month<input type="month" name="month" value="${esc(st.month || '2026-11')}"></label>
      <label class="field">Date nights / week<input type="number" name="dateNightsPerWeek" value="${st.dateNightsPerWeek ?? 1}" min="0" style="width:90px"></label>
      <label class="field">Pts per date night<input type="number" name="dateNightPoints" value="${st.dateNightPoints ?? 10}" min="0" style="width:90px"></label>
      <label class="field">Good day (% of pts)<input type="number" name="goodDayPct" value="${st.goodDayPct ?? 80}" min="1" max="100" style="width:90px"></label>
      <button class="primary">Save</button>
    </form>
    <p class="muted small">Sync: ${mode === 'firebase' ? '✅ Firebase (shared live between devices)' : '⚠️ Local demo mode — data is only on this device. Add your Firebase config to firebase-config.js to share.'}</p>
  </div>`;
  return html;
}

const VIEWS = { today: viewToday, together: viewTogether, calendar: viewCalendar, stats: viewStats, dates: viewDates, settings: viewSettings };

// ---------- rendering ----------

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // Don't wipe out a field the user is typing in; re-render after they leave it.
    const active = document.activeElement;
    if (active && view.contains(active) && active.matches('input:not([type=checkbox]), textarea, select')) {
      active.addEventListener('blur', render, { once: true });
      return;
    }
    if (!data.people[state.me]) state.me = people()[0]?.id || 'p1';
    state.charts.forEach(c => c.destroy());
    state.charts = [];
    const fn = VIEWS[state.tab] || viewToday;
    const openDetails = [...view.querySelectorAll('details[open]')].map((_, i) => i);
    view.innerHTML = fn();
    view.querySelectorAll('details').forEach((d, i) => { if (openDetails.includes(i)) d.open = true; });
    if (state.tab === 'stats') drawStats();
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === state.tab));
    for (const p of people()) document.documentElement.style.setProperty(`--${p.id}`, p.color);
  });
}

function saveLogValue(goalId, value) {
  const id = `${state.me}_${state.date}`;
  put('logs', id, { person: state.me, date: state.date, values: { [goalId]: value }, updatedAt: Date.now() });
}

// ---------- events ----------

view.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'me') {
    state.me = el.dataset.id;
    localStorage.setItem('nh:me', state.me);
    render();
  } else if (a === 'day') {
    state.date = S.addDays(state.date, Number(el.dataset.delta));
    render();
  } else if (a === 'gotoday') {
    state.date = S.todayStr();
    render();
  } else if (a === 'toggle') {
    const cur = data.logs[`${state.me}_${state.date}`]?.values?.[el.dataset.goal];
    saveLogValue(el.dataset.goal, cur !== true);
  } else if (a === 'openday') {
    state.me = el.dataset.id;
    state.date = el.dataset.date;
    location.hash = 'today';
  } else if (a === 'del') {
    if (confirm('Delete this?')) remove(el.dataset.col, el.dataset.id);
  }
});

view.addEventListener('change', e => {
  const el = e.target;
  const a = el.dataset.action;
  if (a === 'num') {
    saveLogValue(el.dataset.goal, el.value === '' ? null : Number(el.value));
  } else if (a === 'note') {
    put('logs', `${state.me}_${state.date}`, { person: state.me, date: state.date, note: el.value, updatedAt: Date.now() });
  } else if (a === 'ideadone') {
    put('dateIdeas', el.dataset.id, { done: el.checked });
  } else if (a === 'goaltype') {
    el.form.querySelector('.num-fields').hidden = el.value !== 'number';
  }
});

view.addEventListener('submit', e => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const f = formData(form);
  const id = form.dataset.id;
  document.activeElement?.blur();

  if (kind === 'person') {
    put('people', id, { name: f.name.trim(), color: f.color, target: Number(f.target) || 0 });
  } else if (kind === 'goal') {
    const goal = { name: f.name.trim(), category: f.category, type: f.type, points: Number(f.points) || 0 };
    if (f.type === 'number') Object.assign(goal, { compare: f.compare, target: Number(f.target) || 0, unit: f.unit.trim() });
    if (id) {
      put('goals', id, goal);
    } else {
      // New goals only count from today on, so earlier days aren't penalized.
      put('goals', newId(), { ...goal, owner: form.dataset.owner, created: Date.now(), since: S.todayStr() });
    }
  } else if (kind === 'reward') {
    put('rewards', id || newId(), { name: f.name.trim(), threshold: Number(f.threshold) || 0 });
  } else if (kind === 'settings') {
    put('settings', 'main', {
      month: f.month, dateNightsPerWeek: Number(f.dateNightsPerWeek) || 0,
      dateNightPoints: Number(f.dateNightPoints) || 0, goodDayPct: Number(f.goodDayPct) || 80,
    });
  } else if (kind === 'datenight') {
    put('dateNights', newId(), { date: f.date, idea: f.idea.trim(), created: Date.now() });
    const match = Object.entries(data.dateIdeas).find(([, i]) => i.text.toLowerCase() === f.idea.trim().toLowerCase());
    if (match) put('dateIdeas', match[0], { done: true });
  } else if (kind === 'idea') {
    put('dateIdeas', newId(), { text: f.text.trim(), done: false, created: Date.now() });
  }
  if (kind !== 'person' && kind !== 'settings' && !id) form.reset();
});

window.addEventListener('hashchange', () => {
  state.tab = location.hash.slice(1) || 'today';
  render();
});

// ---------- start ----------

const banner = document.getElementById('banner');
initDb(render, err => {
  banner.hidden = false;
  banner.textContent = 'Sync error: ' + err.message;
}).then(async () => {
  if (mode === 'local') {
    banner.hidden = false;
    banner.textContent = 'Demo mode: data is saved only on this device. Add Firebase config to sync between phones.';
  }
  await seedIfEmpty();
  render();
}).catch(err => {
  view.innerHTML = `<div class="card">Couldn't start: ${esc(err.message)}</div>`;
});
