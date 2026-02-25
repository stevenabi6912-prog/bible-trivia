import { initAudioUI } from './audio.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const viewEl = document.getElementById('view');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const seasonLabel = document.getElementById('seasonLabel');

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

  if (view === 'season') {
    seasonLabel.textContent = `Season: ${seasonId}`;
  } else {
    seasonLabel.textContent = `Today: ${dayId}`;
  }

  const opts = {
    mode: 'daily',
    // Daily is always “All Categories”
    category: '__ALL__',
    limit,
    dayId: (view === 'today') ? dayId : undefined,
    seasonId: (view === 'season') ? seasonId : undefined,
    onData: (scores) => render(scores),
    onError: (e) => {
      console.error(e);
      statusEl.textContent = 'Leaderboard error. Check Firestore rules / index requirements.';
    }
  };

  unsub = subscribeLeaderboard(opts);
}

viewEl.addEventListener('change', resub);
limitEl.addEventListener('change', resub);

resub();
