import { initAudioUI, unlockAudio, startMusic, getMusicTime, sfx } from './audio.js';
import { loadCategories } from './trivia.js';
// NOTE: daily-attempt check is intentionally done in play.js, not here,
// so that we can navigate synchronously and preserve browser user-activation.

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

// ── Launch game — SYNCHRONOUS so user-activation is never lost ──────────────
// play.js handles the daily-attempt Firebase check after the page loads.
function launchGame(ageGroup) {
  const name = (nameEl.value || '').trim();
  localStorage.setItem('bt_name', name);
  const categoryId = (mode === 'daily') ? '__ALL__' : (catEl.value || '__ALL__');

  const params = new URLSearchParams({
    name,
    category: categoryId,
    mode,
    ...(mode === 'daily' ? { ageGroup } : {}),
  });

  // Snapshot playback position so play.html boot script can resume seamlessly
  try { sessionStorage.setItem('bb_musicPos', String(getMusicTime())); } catch(e) {}
  location.href = `play.html?${params.toString()}`;
}

// Age pick buttons — NO sfx.click() here intentionally.
// HTMLMediaElement.play() is an activation-consuming API: calling it spends the
// browser's transient user-activation token, so the subsequent location.href
// navigation would arrive at play.html without activation and audio.play()
// would be blocked. We skip the click sound to keep the token alive.
pickKidBtn.addEventListener('click', () => {
  localStorage.setItem('bt_ageGroup', 'kid');
  closeAgeModal();
  launchGame('kid');
});

pickAdultBtn.addEventListener('click', () => {
  localStorage.setItem('bt_ageGroup', 'adult');
  closeAgeModal();
  launchGame('adult');
});

// ── Start button ──────────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }

  if (mode === 'daily') {
    // Open modal — age button will navigate. Unlock audio after opening so we
    // don't consume the activation token before the eventual navigation.
    openAgeModal();
    unlockAudio().then(() => startMusic()).catch(() => {});
  } else {
    // Practice: navigate immediately (keeps activation token alive for play.html).
    // Unlock audio fire-and-forget AFTER setting location.href — the async part
    // (AudioContext.resume) runs in a microtask after the navigation is queued.
    launchGame('');
    unlockAudio().then(() => {}).catch(() => {});
  }
});
