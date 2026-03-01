import { initAudioUI, unlockAudio, startMusic, sfx } from './audio.js';
import { loadCategories } from './trivia.js';
import { hasDailyAttempt, normalizePlayerKey } from './scores.js';

// Temporary special event toggle (set enabled:false to remove the event from the UI)
const SPECIAL_EVENT = {
  enabled: true,
  slug: 'missions-2026',
  title: 'Missions Conference Challenge',
  desc: 'Special competition quiz for the conference.'
};

const nameEl = document.getElementById('name');
const catEl = document.getElementById('category');
const startBtn = document.getElementById('start');

initAudioUI();

// Wire up optional Event Mode
if (modeEvent) {
  if (SPECIAL_EVENT.enabled) {
    modeEvent.style.display = '';
    if (eventTitleEl) eventTitleEl.textContent = SPECIAL_EVENT.title;
    if (eventDescEl) eventDescEl.textContent = SPECIAL_EVENT.desc;
    if (eventLbLink) eventLbLink.style.display = '';
  } else {
    modeEvent.style.display = 'none';
    if (eventLbLink) eventLbLink.style.display = 'none';
  }
}

const modeDaily = document.getElementById('modeDaily');
const modePractice = document.getElementById('modePractice');
const modeEvent = document.getElementById('modeEvent');
const eventTitleEl = document.getElementById('eventTitle');
const eventDescEl = document.getElementById('eventDesc');
const eventNote = document.getElementById('eventNote');
const eventLbLink = document.getElementById('eventLeaderboardLink');
const agreeDaily = document.getElementById('agreeDaily');
const dailyDisclaimer = document.getElementById('dailyDisclaimer');
const categoryWrap = document.getElementById('categoryWrap');
const catHelp = document.getElementById('catHelp');

let mode = 'daily'; // default

function setMode(next) {
  try { sfx.click(); } catch (_) {}
  mode = next;

  const daily = mode === 'daily';
  const practice = mode === 'practice';
  const event = mode === 'event';

  modeDaily.classList.toggle('selected', daily);
  modePractice.classList.toggle('selected', practice);
  if (modeEvent) modeEvent.classList.toggle('selected', event);

  modeDaily.setAttribute('aria-checked', String(daily));
  modePractice.setAttribute('aria-checked', String(practice));
  if (modeEvent) modeEvent.setAttribute('aria-checked', String(event));

  // Show/hide notes
  if (dailyDisclaimer) dailyDisclaimer.style.display = daily ? 'block' : 'none';
  if (document.getElementById('dailyNote')) document.getElementById('dailyNote').classList.toggle('fade-hidden', !daily);
  if (eventNote) eventNote.classList.toggle('fade-hidden', !event);

  // Helper text
  if (catHelp) {
    catHelp.textContent = daily
      ? 'Daily Challenge uses the same 10 questions for everyone today (from ANY category).'
      : practice
        ? 'Practice lets you pick a category to train up.'
        : 'Event Challenge uses the special conference question set.';
  }

  // Category is only selectable in Practice
  catEl.disabled = !practice;
  if (!practice) catEl.value = '__ALL__';

  // Hide category selection unless practice
  if (categoryWrap) categoryWrap.style.display = practice ? 'block' : 'none';
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
if (modeEvent) onCardActivate(modeEvent, 'event');

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
  await unlockAudio();
  try { await sfx.click(); } catch (_) {}
  startMusic();
  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }

  localStorage.setItem('bt_name', name);

  let categoryId = catEl.value || '__ALL__';
  if (mode === 'daily') categoryId = '__ALL__';

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
    category: (mode === 'daily' ? '__ALL__' : categoryId),
    count: String(count),
    seconds: String(seconds),
    mode
  });

  if (mode === 'event') params.set('event', SPECIAL_EVENT.slug);
  location.href = `play.html?${params.toString()}`;
});
