import { initAudioUI, unlockAudio, startMusic, sfx } from './audio.js';
import { loadCategories } from './trivia.js';

const nameEl    = document.getElementById('name');
const catEl     = document.getElementById('category');
const startBtn  = document.getElementById('start');

initAudioUI();

const modeDaily    = document.getElementById('modeDaily');
const modePractice = document.getElementById('modePractice');
const dailyDisclaimer = document.getElementById('dailyDisclaimer');
const categoryWrap = document.getElementById('categoryWrap');
const catHelp      = document.getElementById('catHelp');

// Age group modal elements
const ageOverlay   = document.getElementById('ageOverlay');
const ageModal     = document.getElementById('ageModal');
const pickKidBtn   = document.getElementById('pickKid');
const pickAdultBtn = document.getElementById('pickAdult');

let mode = 'daily';

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

  catEl.disabled = daily;
  if (daily) catEl.value = '__ALL__';
  if (categoryWrap) categoryWrap.style.display = daily ? 'none' : 'block';
}

function onCardActivate(card, nextMode) {
  card.addEventListener('click', () => setMode(nextMode));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(nextMode); }
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
if (!cats.length) console.warn('No categories found in questions.json');

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

// ── Launch game ───────────────────────────────────────────────
// Instead of navigating to play.html (which destroys the audio element and
// requires the browser to allow autoplay on a fresh page), we fetch play.html
// and swap the body in-place.  The audio.js module — and its already-playing
// <audio> element — stay alive for the entire session.  play.js imports the
// same cached audio.js module instance, so startMusic() sees the live element.
async function launchGame(ageGroup) {
  const name = (nameEl.value || '').trim();
  localStorage.setItem('bt_name', name);
  const categoryId = (mode === 'daily') ? '__ALL__' : (catEl.value || '__ALL__');

  const params = new URLSearchParams({
    name,
    category: categoryId,
    mode,
    ...(mode === 'daily' ? { ageGroup } : {}),
  });

  const playUrl = `play.html?${params.toString()}`;

  try {
    // Fetch play.html HTML (usually already cached by the browser)
    const res  = await fetch('play.html');
    const html = await res.text();
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(html, 'text/html');

    // Update the address bar without a real navigation
    history.pushState({}, '', playUrl);
    document.title = newDoc.title;

    // Swap the body — audio.js and its bg element are unaffected (module scope)
    document.body.className = newDoc.body.className;
    document.body.innerHTML = newDoc.body.innerHTML;

    // Dynamically load play.js as a module.
    // Its imports (audio.js, trivia.js, scores.js) are served from the module
    // cache, so audio.js is the SAME instance with the already-playing element.
    const s = document.createElement('script');
    s.type = 'module';
    // Cache-bust so the browser re-executes play.js for this new game session
    s.src  = 'play.js?t=' + Date.now();
    document.body.appendChild(s);

  } catch (err) {
    // Network failure — fall back to a real navigation
    console.warn('In-page swap failed, falling back to navigation:', err);
    location.href = playUrl;
  }
}

// Age pick buttons
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
  startMusic();
  try { sfx.click(); } catch (_) {}

  const name = (nameEl.value || '').trim();
  if (!name) { alert('Enter a player name (first name + last initial works great).'); return; }

  if (mode === 'daily') {
    openAgeModal();
  } else {
    await launchGame('');
  }
});
