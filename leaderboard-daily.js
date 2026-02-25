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
  return `${y}Q${q}`;
}
const now = new Date();
const dayId = now.toISOString().slice(0, 10);
const seasonId = seasonIdFor(now);
seasonLabel.textContent = `Season: ${seasonId}`;

let data = null;
try {
  data = await loadCategories();
} catch (e) {
  console.error('Failed to load categories:', e);
}
if (data?.categories) {
  for (const c of data.categories) } // filter uses stored title

let unsub = null;

function fmtDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return '';
    return d.toLocaleDateString();
  } catch { return ''; }
}

function render(list) {
  rowsEl.innerHTML = '';
  list.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(s.name || '')}</td>      <td><b>${Number(s.score || 0)}</b></td>
      <td>${Number(s.correct || 0)}/${Number(s.total || 0)}</td>
      <td>${fmtDate(s.createdAt)}</td>
    `;
    rowsEl.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function resub() {
  statusEl.textContent = 'Loading…';
  rowsEl.innerHTML = '';

  if (unsub) unsub();

  const category =   const view = viewEl.value;
  const limit = Number(limitEl.value) || 20;

  const opts = {
    category,
    limit,
    mode: 'daily',
    seasonId: view === 'season' ? seasonId : null,
    dayId: view === 'today' ? dayId : null,
    onData: (scores) => {
      statusEl.textContent = scores.length ? '' : 'No scores yet—be the first!';
      render(scores);
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

resub();
