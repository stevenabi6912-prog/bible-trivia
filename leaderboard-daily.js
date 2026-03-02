import { initAudioUI } from './audio.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const viewEl = document.getElementById('view');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const labelEl = document.getElementById('seasonLabel');

const lastWeekWinnerEl = document.getElementById('lastWeekWinner');
const lastWeekRangeEl = document.getElementById('lastWeekRange');

function pad2(n) { return String(n).padStart(2, '0'); }

function dayIdFor(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayId(dayId) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(dayId || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  const d = new Date(y, mo, da);
  return isNaN(d.getTime()) ? null : d;
}

// Sunday 12:00 AM local time
function weekStartSunday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // Sunday=0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

function scoreLocalDate(s) {
  // Prefer dayId (stable and doesn't depend on Timestamp precision)
  if (s?.dayId) {
    const d = parseDayId(s.dayId);
    if (d) return d;
  }
  // Fall back to createdAt Timestamp/date/millis
  const v = s?.createdAt || s?.date;
  if (v?.toDate && typeof v.toDate === 'function') return v.toDate();
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val) {
  if (!val) return '';
  if (typeof val?.toDate === 'function') return val.toDate().toLocaleDateString();
  const d = (val instanceof Date) ? val : new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function sortScores(scores) {
  scores.sort((a, b) => {
    const sa = Number(a.score) || 0;
    const sb = Number(b.score) || 0;
    if (sb !== sa) return sb - sa;

    const ca = Number(a.correct) || 0;
    const cb = Number(b.correct) || 0;
    if (cb !== ca) return cb - ca;

    const ma = Number(a.ms) || Number(a.time) || 0;
    const mb = Number(b.ms) || Number(b.time) || 0;
    return ma - mb;
  });
  return scores;
}

function render(scores, limit) {
  rowsEl.innerHTML = '';
  const list = (scores || []).slice(0, limit);

  if (list.length === 0) {
    statusEl.textContent = 'No scores yet.';
    return;
  }
  statusEl.textContent = '';

  const frag = document.createDocumentFragment();

  list.forEach((s, i) => {
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

let unsub = null;
let rawDaily = [];

function updateLastWeekWinner() {
  if (!lastWeekWinnerEl) return;

  const now = new Date();
  const thisWeekStart = weekStartSunday(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  if (lastWeekRangeEl) {
    const end = new Date(thisWeekStart);
    end.setDate(end.getDate() - 1);
    lastWeekRangeEl.textContent = `${lastWeekStart.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }

  const lastWeekScores = rawDaily.filter(s => {
    const d = scoreLocalDate(s);
    return d && d >= lastWeekStart && d < thisWeekStart;
  });

  sortScores(lastWeekScores);

  const w = lastWeekScores[0];
  if (!w) {
    lastWeekWinnerEl.textContent = '—';
    return;
  }

  const name = w.playerName || w.name || 'Anonymous';
  const score = Number(w.score) || 0;
  const correct = Number(w.correct) || 0;
  lastWeekWinnerEl.textContent = `${name} — ${score} pts (${correct} correct)`;
}

function applyView() {
  const now = new Date();
  const limit = Number(limitEl.value) || 20;

  // Weekly leaderboard is the “real” daily leaderboard
  if (viewEl.value === 'today') {
    const todayId = dayIdFor(now);
    const todayScores = rawDaily.filter(s => {
      if (s.dayId) return s.dayId === todayId;
      const d = scoreLocalDate(s);
      return d && dayIdFor(d) === todayId;
    });
    sortScores(todayScores);
    labelEl.textContent = `Today: ${todayId}`;
    render(todayScores, limit);
    return;
  }

  // This Week: Sunday 00:00 → next Sunday 00:00
  const start = weekStartSunday(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const weekScores = rawDaily.filter(s => {
    const d = scoreLocalDate(s);
    return d && d >= start && d < end;
  });

  sortScores(weekScores);
  labelEl.textContent = `Week of ${dayIdFor(start)}`;
  render(weekScores, limit);
}

function resub() {
  if (typeof unsub === 'function') unsub();

  // Pull recent Daily scores and do all the “week” logic client-side.
  // This avoids Firestore composite index requirements and keeps behavior consistent.
  unsub = subscribeLeaderboard({
    mode: 'daily',
    category: '__ALL__',
    limit: 200,
    onData: (scores) => {
      rawDaily = scores || [];
      updateLastWeekWinner();
      applyView();
    },
    onError: (e) => {
      console.error(e);
      statusEl.textContent = 'Leaderboard error. Check Firestore rules / indexes.';
    }
  });
}

viewEl.addEventListener('change', applyView);
limitEl.addEventListener('change', applyView);

resub();
