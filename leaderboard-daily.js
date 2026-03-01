import { initAudioUI } from './audio.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const viewEl = document.getElementById('view');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const seasonLabel = document.getElementById('seasonLabel');
const lastWeekWinnerEl = document.getElementById('lastWeekWinner');
const lastWeekRangeEl = document.getElementById('lastWeekRange');


function seasonIdFor(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function dayIdFor(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDayId(dayId) {
  if (!dayId) return null;
  const parts = String(dayId).split('-').map(n => Number(n));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d); // local midnight
}

function scoreLocalDayDate(s) {
  // Prefer dayId (YYYY-MM-DD) because it is stable and doesn't require Firestore indexes.
  if (s?.dayId && typeof s.dayId === 'string') {
    const d = parseDayId(s.dayId);
    if (d) return d;
  }
  // Fall back to createdAt Timestamp/date/millis
  const v = s?.createdAt || s?.date;
  if (v?.toDate && typeof v.toDate === 'function') return v.toDate();
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function weekStartSunday(d) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - base.getDay()); // Sunday = 0
  return base;
}

function fmtDate(val) {
  if (!val) return '';
  // Firestore Timestamp support
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return d.toLocaleDateString();
  }
  // millis/Date fallback
  const d = (val instanceof Date) ? val : new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let unsub = null;

function render(scores) {
  rowsEl.innerHTML = '';
  if (!scores || scores.length === 0) {
    statusEl.textContent = 'No scores yet.';
    return;
  }
  statusEl.textContent = '';

  const frag = document.createDocumentFragment();

  scores.forEach((s, i) => {
    const tr = document.createElement('tr');

    const rank = document.createElement('td');
    rank.textContent = String(i + 1);

    const name = document.createElement('td');
    name.textContent = s.playerName || s.name || 'Anonymous';

    const score = document.createElement('td');
    score.className = 'num';
    score.textContent = String(Number(s.score) || 0);

    const correct = document.createElement('td');
    correct.className = 'num';
    correct.textContent = String(Number(s.correct) || 0);

    const date = document.createElement('td');
    date.textContent = fmtDate(s.createdAt || s.date);

    tr.append(rank, name, score, correct, date);
    frag.appendChild(tr);
  });

  rowsEl.appendChild(frag);
}

function resub() {
  if (typeof unsub === 'function') unsub();

  const now = new Date();
  const view = viewEl.value;
  const limit = Number(limitEl.value) || 20;

  const dayId = dayIdFor(now);
  const seasonId = seasonIdFor(now);

  // Weekly reset: Sunday 12:00 AM local time.
  const ws = weekStartSunday(now);
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);

  if (view === 'week') {
    seasonLabel.textContent = `Week of ${ws.toLocaleDateString()}`;
  } else {
    seasonLabel.textContent = `Today: ${dayId}`;
  }

  const opts = {
    mode: 'daily',
    // Daily is always “All Categories”
    category: '__ALL__',
    // Pull extra, then filter/slice client-side (avoids Firestore index headaches)
    limit: 200,
    dayId: (view === 'today') ? dayId : undefined,
    seasonId: (view === 'week') ? seasonId : undefined,
    onData: (scores) => {
      let list = scores || [];
      if (view === 'week') {
        list = list.filter(s => {
          const d = parseDayId(s.dayId);
          return d && d >= ws && d < we;
        });
      }
      // subscribeLeaderboard already sorts for us.
      list = list.slice(0, Math.max(1, Math.min(limit, 200)));
      render(list);
    },
    onError: (e) => {
      console.error(e);
      statusEl.textContent = 'Leaderboard error. Check Firestore rules / index requirements.';
    }
  };

  unsub = subscribeLeaderboard(opts);
}

viewEl.addEventListener('change', resub);
limitEl.addEventListener('change', resub);


let unsubLastWeek = null;

function updateLastWeekWinner(allDailyScores) {
  if (!lastWeekWinnerEl) return;

  const now = new Date();
  const thisWeekStart = weekStartSunday(now); // Sunday 00:00 local
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  if (lastWeekRangeEl) {
    const end = new Date(thisWeekStart);
    end.setDate(end.getDate() - 1);
    lastWeekRangeEl.textContent = `${lastWeekStart.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }

  const inLastWeek = (s) => {
    const d = scoreLocalDayDate(s);
    if (!d) return false;
    return d >= lastWeekStart && d < thisWeekStart;
  };

  let scores = (allDailyScores || []).filter(inLastWeek);

  // Sort using same rules: score desc, correct desc, ms asc
  scores.sort((a, b) => {
    const sa = Number(a.score) || 0;
    const sb = Number(b.score) || 0;
    if (sb !== sa) return sb - sa;
    const ca = Number(a.correct) || 0;
    const cb = Number(b.correct) || 0;
    if (cb !== ca) return cb - ca;
    const ma = Number(a.ms) || 0;
    const mb = Number(b.ms) || 0;
    return ma - mb;
  });

  const w = scores[0];
  if (!w) {
    lastWeekWinnerEl.textContent = '—';
    return;
  }

  const name = w.playerName || w.name || 'Anonymous';
  const score = Number(w.score) || 0;
  const correct = Number(w.correct) || 0;
  lastWeekWinnerEl.textContent = `${name} — ${score} pts (${correct} correct)`;
}

function subLastWeekWinner() {
  if (typeof unsubLastWeek === 'function') unsubLastWeek();

  // Pull recent Daily scores (client-side filtering for last week).
  unsubLastWeek = subscribeLeaderboard({
    mode: 'daily',
    limit: 200,
    category: '__ALL__',
    onData: (scores) => updateLastWeekWinner(scores),
    onError: (e) => {
      console.error(e);
      if (lastWeekWinnerEl) lastWeekWinnerEl.textContent = '—';
      if (lastWeekRangeEl) lastWeekRangeEl.textContent = '';
    }
  });
}

subLastWeekWinner();

resub();
