import { loadCategories } from './trivia.js';
import { subscribeLeaderboard } from './scores.js';

const catEl = document.getElementById('cat');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const seasonLabel = document.getElementById('seasonLabel');

function seasonIdFor(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}Q${q}`;
}
const seasonId = seasonIdFor(new Date());
seasonLabel.textContent = seasonId;

const data = await loadCategories();
catEl.innerHTML = '';
catEl.append(new Option('All Categories', '__ALL__'));
for (const c of data.categories) catEl.append(new Option(c.title, c.title)); // filter uses stored title

let unsub = null;

function fmtDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return '';
    return d.toLocaleDateString();
  } catch { return ''; }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function render(list) {
  rowsEl.innerHTML = '';
  list.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(s.name || '')}</td>
      <td>${escapeHtml(s.category || '')}</td>
      <td><b>${Number(s.score || 0)}</b></td>
      <td>${Number(s.correct || 0)}/${Number(s.total || 0)}</td>
      <td>${fmtDate(s.createdAt)}</td>
    `;
    rowsEl.appendChild(tr);
  });
}

function resub() {
  statusEl.textContent = 'Loading…';
  rowsEl.innerHTML = '';
  if (unsub) unsub();

  const category = catEl.value;
  const limit = Number(limitEl.value) || 20;

  unsub = subscribeLeaderboard({
    category,
    limit,
    mode: 'practice',
    seasonId,
    dayId: null,
    onData: (scores) => {
      statusEl.textContent = scores.length ? '' : 'No scores yet—be the first!';
      render(scores);
    },
    onError: (e) => {
      console.error(e);
      statusEl.textContent = 'Leaderboard error. Check Firestore rules / index requirements.';
    }
  });
}

catEl.addEventListener('change', resub);
limitEl.addEventListener('change', resub);

resub();
