const qs = new URLSearchParams(location.search);
const name = qs.get('name') || 'Player';
const category = qs.get('category') || 'All Categories';
const score = qs.get('score') || '0';
const correct = qs.get('correct') || '0';
const total = qs.get('total') || '0';
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
