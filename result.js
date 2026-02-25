import { fetchLeaderboardOnce } from './scores.js';
const qs = new URLSearchParams(location.search);
const name = qs.get('name') || 'Player';
const category = qs.get('category') || 'All Categories';
const score = qs.get('score') || '0';
const correct = qs.get('correct') || '0';
const total = qs.get('total') || '0';
const seasonId = qs.get('seasonId') || '';
const dayId = qs.get('dayId') || '';
const docId = qs.get('docId') || '';
const mode = (qs.get('mode') || 'daily').toLowerCase() === 'practice' ? 'practice' : 'daily';

document.getElementById('name').textContent = name;
document.getElementById('cat').textContent = category;
document.getElementById('score').textContent = score;
document.getElementById('correct').textContent = correct;
document.getElementById('total').textContent = total;

document.getElementById('mode').textContent = mode === 'daily' ? 'Daily Challenge' : 'Practice';

const lbLink = document.getElementById('lbLink');
lbLink.href = mode === 'daily' ? 'leaderboard-daily.html' : 'leaderboard-practice.html';
lbLink.textContent = mode === 'daily' ? 'View Daily Leaderboard' : 'View Practice Leaderboard';


function showRank(text) {
  const el = document.getElementById('rankLine');
  if (!el) return;
  el.innerHTML = text;
  el.classList.remove('fade-hidden');
}

function confettiBurst() {
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['#ff5ea8', '#ffd166', '#06d6a0', '#4cc9f0', '#9b5de5', '#ff9f1c'];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random()*100) + 'vw';
    piece.style.background = colors[i % colors.length];
    piece.style.width = (6 + Math.random()*8) + 'px';
    piece.style.height = (10 + Math.random()*10) + 'px';
    piece.style.transform = `translateY(-10px) rotate(${Math.random()*360}deg)`;
    piece.style.animationDuration = (1.0 + Math.random()*0.9) + 's';
    piece.style.animationDelay = (Math.random()*0.12) + 's';
    wrap.appendChild(piece);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2400);
}

async function computeRank() {
  // Only show rank if we can place it within a reasonable "top" window.
  const limit = 100;

  if (mode === 'daily') {
    // Daily rank is for today's challenge (all categories)
    const list = await fetchLeaderboardOnce({ limit, dayId, mode: 'daily' });
    const idx = list.findIndex(r => r.id === docId);
    if (idx >= 0) {
      showRank(`🏆 <b>Daily Rank:</b> #${idx + 1} today`);
    } else {
      showRank(`✅ Score saved for today's Daily Challenge.`);
    }
    confettiBurst();
  } else {
    // Practice rank is per category (season)
    const list = await fetchLeaderboardOnce({ limit, seasonId, mode: 'practice', category });
    const idx = list.findIndex(r => r.id === docId);
    if (idx >= 0) {
      showRank(`🎯 <b>Practice Rank:</b> #${idx + 1} this season (${category})`);
    } else {
      showRank(`✅ Score saved to the Practice Leaderboard.`);
    }
  }
}

computeRank().catch(() => {
  // If rank can't be computed, fail silently (score may still be saved).
});
