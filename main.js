import { loadCategories } from './trivia.js';
import { hasDailyAttempt, normalizePlayerKey } from './scores.js';

const nameEl = document.getElementById('name');
const catEl = document.getElementById('category');
const startBtn = document.getElementById('start');

const modeDaily = document.getElementById('modeDaily');
const modePractice = document.getElementById('modePractice');
const agreeDaily = document.getElementById('agreeDaily');
const dailyDisclaimer = document.getElementById('dailyDisclaimer');
const modeHint = document.getElementById('modeHint');
const catHelp = document.getElementById('catHelp');

let mode = 'daily'; // default

function setMode(next) {
  mode = next;
  const daily = mode === 'daily';

  modeDaily.classList.toggle('selected', daily);
  modePractice.classList.toggle('selected', !daily);

  modeDaily.setAttribute('aria-checked', String(daily));
  modePractice.setAttribute('aria-checked', String(!daily));

  dailyDisclaimer.style.display = daily ? 'block' : 'none';

  modeHint.textContent = daily
    ? 'Daily Challenge is selected. One attempt per day.'
    : 'Practice is selected. Random questions to train up.';

  catHelp.textContent = daily
    ? 'Daily Challenge uses the same 10 questions for everyone today (per category).'
    : 'Practice is random questions (great for learning).';
}

function onCardActivate(card, nextMode) {
  card.addEventListener('click', () => setMode(nextMode));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMode(nextMode);
    }
  });
}

onCardActivate(modeDaily, 'daily');
onCardActivate(modePractice, 'practice');

setMode('daily');

const savedName = localStorage.getItem('bt_name');
if (savedName) nameEl.value = savedName;

const { categories } = await loadCategories();
catEl.innerHTML = '';
catEl.append(new Option('All Categories', '__ALL__'));
for (const c of categories) catEl.append(new Option(c.title, c.id));

function seasonIdFor(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}Q${q}`;
}

startBtn.addEventListener('click', async () => {
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }

  localStorage.setItem('bt_name', name);

  const categoryId = catEl.value || '__ALL__';

  // Locked competition settings
  const count = 10;
  const seconds = 15;

  const now = new Date();
  const dayId = now.toISOString().slice(0, 10);
  const seasonId = seasonIdFor(now);

  if (mode === 'daily') {
    if (!agreeDaily.checked) {
      alert('Before you start: Daily Challenge is ONE attempt per day. Check the box to confirm.');
      return;
    }

    // Enforce 1 daily attempt per player name per day (best-effort, without login)
    const playerKey = normalizePlayerKey(name);
    const dailyKey = `${dayId}_${playerKey}`; // single-field lookup (no composite index needed)

    try {
      const already = await hasDailyAttempt(dailyKey);
      if (already) {
        alert('Looks like you already played today’s Daily Challenge with this name. Come back tomorrow!');
        return;
      }
    } catch (e) {
      console.error(e);
      alert('Could not verify daily attempt. Check Firebase rules / config.');
      return;
    }
  }

  const params = new URLSearchParams({
    name,
    category: categoryId,
    count: String(count),
    seconds: String(seconds),
    mode
  });

  location.href = `play.html?${params.toString()}`;
});
