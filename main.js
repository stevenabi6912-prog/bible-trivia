import { loadCategories } from './trivia.js';

const nameEl = document.getElementById('name');
const catEl = document.getElementById('category');
const countEl = document.getElementById('count');
const secEl = document.getElementById('seconds');
const dailyEl = document.getElementById('daily');
const startBtn = document.getElementById('start');

const savedName = localStorage.getItem('bt_name');
if (savedName) nameEl.value = savedName;

const { categories } = await loadCategories();
catEl.innerHTML = '';
catEl.append(new Option('All Categories', '__ALL__'));
for (const c of categories) catEl.append(new Option(c.title, c.id));

startBtn.addEventListener('click', () => {
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }
  localStorage.setItem('bt_name', name);

  const params = new URLSearchParams({
    name,
    category: catEl.value,
    count: countEl.value,
    seconds: secEl.value,
    daily: dailyEl && dailyEl.checked ? '1' : '0'
  });
  window.location.href = `play.html?${params.toString()}`;
});
