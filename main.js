import { initAudioUI, unlockAudio, startMusic, sfx } from './audio.js';
import { loadCategories } from './trivia.js';
import { hasDailyAttempt, normalizePlayerKey } from './scores.js';

/**
 * Toggle-able special event mode (e.g., Missions Conference).
 * Set enabled:false to hide it completely (no buttons/links).
 */
const SPECIAL_EVENT = {
  enabled: false,
  slug: 'missions-2026',
  title: 'Missions Conference Challenge'
};

// ---- DOM ----
const nameEl = document.getElementById('name');
const catEl = document.getElementById('category');
const startBtn = document.getElementById('start');

const modeDaily = document.getElementById('modeDaily');
const modePractice = document.getElementById('modePractice');

const agreeDaily = document.getElementById('agreeDaily');
const dailyDisclaimer = document.getElementById('dailyDisclaimer');
const dailyNote = document.getElementById('dailyNote');

const categoryWrap = document.getElementById('categoryWrap');
const catHelp = document.getElementById('catHelp');

const eventContainer = document.getElementById('eventContainer');

initAudioUI();

let mode = 'daily'; // default

function safeText(el, text) {
  if (el) el.textContent = text;
}

function setMode(next) {
  try { sfx.click(); } catch (_) {}
  mode = next;
  const daily = mode === 'daily';

  // Visual selection states
  if (modeDaily) {
    modeDaily.classList.toggle('selected', daily);
    modeDaily.setAttribute('aria-checked', String(daily));
  }
  if (modePractice) {
    modePractice.classList.toggle('selected', !daily);
    modePractice.setAttribute('aria-checked', String(!daily));
  }

  // Daily disclaimer + helper
  if (dailyDisclaimer) dailyDisclaimer.style.display = daily ? 'block' : 'none';
  if (dailyNote) dailyNote.classList.toggle('fade-hidden', !daily);

  safeText(catHelp, daily
    ? 'Daily Challenge uses the same 10 questions for everyone today (from ANY category).'
    : 'Practice lets you pick a category to train up.'
  );

  // Category is only selectable in Practice
  if (categoryWrap) categoryWrap.classList.toggle('fade-hidden', daily);
  if (catEl) catEl.disabled = daily;

  // Daily requires checkbox acknowledgement
  if (agreeDaily) {
    if (!daily) agreeDaily.checked = true;
    agreeDaily.style.opacity = daily ? '1' : '0.5';
  }

  updateStartEnabled();
}

function updateStartEnabled() {
  if (!startBtn) return;
  const nameOk = !!(nameEl && nameEl.value.trim().length >= 2);
  const dailyOk = (mode !== 'daily') || (!!agreeDaily && agreeDaily.checked);
  startBtn.disabled = !(nameOk && dailyOk);
}

async function boot() {
  // Populate categories (for Practice mode)
  try {
    if (catEl) {
      const cats = await loadCategories();
      catEl.innerHTML = '';
      for (const c of cats) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title;
        catEl.appendChild(opt);
      }
    }
  } catch (e) {
    console.error('Failed to load categories', e);
  }

  // Wire mode buttons
  if (modeDaily) modeDaily.addEventListener('click', () => setMode('daily'));
  if (modePractice) modePractice.addEventListener('click', () => setMode('practice'));

  // Start button enable logic
  if (nameEl) nameEl.addEventListener('input', updateStartEnabled);
  if (agreeDaily) agreeDaily.addEventListener('change', updateStartEnabled);

  // Special event (hidden if disabled)
  if (eventContainer) {
    if (SPECIAL_EVENT.enabled) {
      eventContainer.classList.remove('fade-hidden');

      const wrap = document.createElement('div');
      wrap.className = 'eventCard';

      const title = document.createElement('div');
      title.className = 'eventTitle';
      title.textContent = SPECIAL_EVENT.title;

      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Play Event Quiz';
      btn.addEventListener('click', () => {
        // Music unlocks on click naturally
        const name = (nameEl?.value || '').trim();
        if (!name) {
          alert('Please enter your name first.');
          return;
        }
        const params = new URLSearchParams({
          name,
          mode: 'event',
          event: SPECIAL_EVENT.slug,
          category: '__EVENT__',
          count: '10',
          seconds: '15'
        });
        location.href = `play.html?${params.toString()}`;
      });

      const lb = document.createElement('a');
      lb.className = 'btn btn-ghost';
      lb.href = 'leaderboard-event.html';
      lb.textContent = 'Event Leaderboard';

      wrap.append(title, btn, lb);
      eventContainer.replaceChildren(wrap);
    } else {
      eventContainer.classList.add('fade-hidden');
      eventContainer.replaceChildren();
    }
  }

  // Default state
  setMode('daily');
}

startBtn?.addEventListener('click', async () => {
  try { sfx.start(); } catch (_) {}
  try { unlockAudio(); } catch (_) {}
  try { startMusic(); } catch (_) {}

  const name = (nameEl?.value || '').trim();
  if (!name) return;

  // Daily attempt guard
  if (mode === 'daily') {
    const key = normalizePlayerKey(name);
    const already = await hasDailyAttempt(key);
    if (already) {
      alert('Daily Challenge already completed today for this name. Try Practice instead!');
      return;
    }
  }

  const categoryId = (catEl?.value || '__ALL__');

  const params = new URLSearchParams({
    name,
    category: (mode === 'daily' ? '__ALL__' : categoryId),
    count: '10',
    seconds: '15',
    mode
  });

  location.href = `play.html?${params.toString()}`;
});

boot();
