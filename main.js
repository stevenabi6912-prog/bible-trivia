import { initAudioUI, unlockAudio, startMusic, getMusicTime, sfx } from './audio.js';
import { loadCategories } from './trivia.js';
import { hasDailyAttempt, normalizePlayerKey } from './scores.js';

const nameEl = document.getElementById('name');
const catEl = document.getElementById('category');
const startBtn = document.getElementById('start');

initAudioUI();

const modeDaily    = document.getElementById('modeDaily');
const modePractice = document.getElementById('modePractice');
const dailyDisclaimer = document.getElementById('dailyDisclaimer');
const categoryWrap = document.getElementById('categoryWrap');
const catHelp      = document.getElementById('catHelp');

// Age group modal elements
const ageOverlay  = document.getElementById('ageOverlay');
const ageModal    = document.getElementById('ageModal');
const pickKidBtn  = document.getElementById('pickKid');
const pickAdultBtn = document.getElementById('pickAdult');

let mode = 'daily'; // default

// ── Mode selection ────────────────────────────────────────────
function setMode(next) {
  try { sfx.click(); } catch (_) {}
  mode = next;
  const daily = mode === 'daily';

  modeDaily.classList.toggle('selected', daily);
  modePractice.classList.toggle('selected', !daily);

  modeDaily.setAttribute('aria-checked', String(daily));
  modePractice.setAttribute('aria-checked', String(!daily));

  if (dailyDisclaimer) dailyDisclaimer.style.display = daily ? 'block' : 'none';
  catHelp.textContent = daily
    ? 'Daily Challenge uses the same 10 questions for everyone today (from ANY category).'
    : 'Practice lets you pick a category to train up.';

  // Category is only selectable in Practice
  catEl.disabled = daily;
  if (daily) catEl.value = '__ALL__';
  if (categoryWrap) categoryWrap.style.display = daily ? 'none' : 'block';
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
  const cats = Array.isArray(categories) ? categories : Object.values(categories || {});
  catEl.innerHTML = '';
  catEl.append(new Option('All Categories', '__ALL__'));
  for (const c of cats) catEl.append(new Option(c.title, c.id));
  if (!cats.length) {
    console.warn('No categories found in questions.json');
  }

function seasonIdFor(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}Q${q}`;
}

// ── Age Group Modal ───────────────────────────────────────────
function openAgeModal() {
  ageOverlay.classList.add('open');
  ageModal.classList.add('open');
}

function closeAgeModal() {
  ageOverlay.classList.remove('open');
  ageModal.classList.remove('open');
}

ageOverlay.addEventListener('click', closeAgeModal);

// ── Launch game (called after age group is confirmed or for practice) ──
async function launchGame(ageGroup) {
  const name = (nameEl.value || '').trim();
  localStorage.setItem('bt_name', name);

  let categoryId = catEl.value || '__ALL__';
  if (mode === 'daily') categoryId = '__ALL__';

  const count = 10;
  const seconds = 15;

  const now = new Date();
  const dayId = now.toISOString().slice(0, 10);
  const seasonId = seasonIdFor(now);

  if (mode === 'daily') {
    const playerKey = normalizePlayerKey(name);
    const dailyKey = `${dayId}_${playerKey}`;

    try {
      const already = await hasDailyAttempt(dailyKey);
      if (already) {
        alert('Looks like you already played today\u2019s Daily Challenge with this name. Come back tomorrow!');
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
    category: (mode === 'daily' ? '__ALL__' : categoryId),
    count: String(count),
    seconds: String(seconds),
    mode,
    ...(mode === 'daily' ? { ageGroup } : {})
  });

  // Save music playback position so play.html can resume from the same spot
  try { sessionStorage.setItem('bb_musicPos', String(getMusicTime())); } catch(e) {}
  location.href = `play.html?${params.toString()}`;
}

// Age pick buttons inside the modal
pickKidBtn.addEventListener('click', async () => {
  try { sfx.click(); } catch (_) {}
  localStorage.setItem('bt_ageGroup', 'kid');
  closeAgeModal();
  await launchGame('kid');
});

pickAdultBtn.addEventListener('click', async () => {
  try { sfx.click(); } catch (_) {}
  localStorage.setItem('bt_ageGroup', 'adult');
  closeAgeModal();
  await launchGame('adult');
});

// ── Start button ──────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  await unlockAudio();
  try { await sfx.click(); } catch (_) {}
  startMusic();
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }

  if (mode === 'daily') {
    // Show the age group modal — game launches after user picks
    openAgeModal();
  } else {
    // Practice mode: skip the modal, launch directly
    await launchGame('');
  }
});
