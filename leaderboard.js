import { initAudioUI } from './audio.js';
import { loadCategories } from './trivia.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const catEl = document.getElementById('cat');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');

const data = await loadCategories();
catEl.innerHTML = '';
catEl.append(new Option('All Categories', '__ALL__'));
for (const c of data.categories) catEl.append(new Option(c.title, c.title)); // use title for category display

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
      <td>${i+1}</td>
      <td>${escapeHtml(s.name || '')}</td>
      <td>${escapeHtml(s.category || '')}</td>
      <td>${s.score ?? ''}</td>
      <td>${s.correct ?? ''}/${s.total ?? ''}</td>
      <td>${fmtDate(s.createdAt)}</td>
    `;
    rowsEl.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function setStatus(msg) { statusEl.textContent = msg; }

function resub() {
  if (unsub) unsub();

  const view = viewEl ? viewEl.value : 'today';
  const seasonId = (view === 'season') ? currentSeason : currentSeason;
  const dayId = (view === 'today') ? todayId : null;

  setStatus('Loading…');
  unsub = subscribeLeaderboard({
    category: catEl.value,
    limit: parseInt(limitEl.value, 10),
    mode: 'daily',
    seasonId: seasonId,
    dayId: dayId,
    onData: (scores) => { setStatus(''); render(scores); },
    onError: (e) => {
      console.error(e);
      setStatus('Leaderboard error. If this is the first time, Firestore may require an index (check the console for a link).');
    }
  });
}

catEl.addEventListener('change', resub);
('change', resub);
limitEl.addEventListener('change', resub);
if (viewEl) viewEl.addEventListener('change', resub);

resub();
