import { initAudioUI, unlockAudio, startMusic, sfx } from './audio.js';
import { loadCategories, buildRound, buildDailyRound, makeChoicesForQuestion, answerMatches, pickCanonicalAnswer } from './trivia.js';
import { saveScore, hasDailyAttempt, normalizePlayerKey } from './scores.js';

const qs = new URLSearchParams(location.search);
initAudioUI();
const playerName = qs.get('name') || 'Player';
const categoryIdParam = qs.get('category') || '__ALL__';
const modeRaw = (qs.get('mode') || 'daily').toLowerCase();
const mode = (modeRaw === 'practice' || modeRaw === 'event') ? modeRaw : 'daily';
const eventSlug = qs.get('event') || '';
const categoryId = (mode === 'daily' || mode === 'event') ? '__ALL__' : categoryIdParam;

// Locked competitive settings
const QUESTION_COUNT = 10;
const SECONDS_PER = 15;

const el = (id) => document.getElementById(id);
const safeSet = (id, text) => { const node = el(id); if (node) node.textContent = text; };

safeSet('pillName', playerName);

function seasonIdFor(d) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}Q${q}`; // resets every 3 months
}

const now = new Date();
const seasonId = seasonIdFor(now);
const dayId = now.toISOString().slice(0, 10);

// Best-effort: one attempt per day per player name (no login)
const playerKey = normalizePlayerKey(playerName);
const dailyKey = `${dayId}_${playerKey}`;

const data = await loadCategories();
const categories = data.categories;

async function loadEventSet(slug) {
  const res = await fetch(`${slug}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load event question set: ${slug}.json`);
  const data = await res.json();
  if (!data || !Array.isArray(data.questions)) throw new Error('Event file missing "questions" array.');
  return data;
}


// Build a global pool of answers for distractors
const answerPool = Array.from(new Set(categories.flatMap(c => (c.questions || []).map(q => pickCanonicalAnswer(q.answer)))));

const categoryAnswerPool = (categoryId === '__ALL__') ? answerPool : Array.from(new Set((categories.find(c => c.id === categoryId)?.questions || []).map(q => pickCanonicalAnswer(q.answer))));

let catTitle = categoryId === '__ALL__'
  ? 'All Categories'
  : (categories.find(c => c.id === categoryId)?.title || 'Category');

safeSet('pillCat', catTitle);
safeSet('pillMode', mode === 'daily' ? 'Daily Challenge' : 'Practice';

if (mode === 'daily') {
  try {
    const already = await hasDailyAttempt(dailyKey);
    if (already) {
      alert('You already played today’s Daily Challenge with this name. Come back tomorrow!');
      location.href = 'index.html';
      throw new Error('Daily already played');
    }
  } catch (e) {
    // if we redirected, stop; otherwise let the error surface
    if (location.href.endsWith('index.html')) throw e;
    console.error(e);
    alert('Could not verify daily attempt. Check Firebase rules / config.');
  }
}

let round = [];
try {
  if (mode === 'event') {
    if (!eventSlug) throw new Error('Missing event slug.');
    const eventSet = await loadEventSet(eventSlug);
    catTitle = String(eventSet.title || 'Event Challenge');
    safeSet('pillCat', catTitle);

    // Event questions are manual: {question, options[], answerIndex, reference?}
    round = (eventSet.questions || []).slice(0, QUESTION_COUNT).map((q) => {
      const opts = Array.isArray(q.options) ? q.options.map(String) : [];
      const ai = Number(q.answerIndex);
      const ans = (opts[ai] ?? '');
      if (!ans) throw new Error('Event question missing valid answerIndex/options.');
      return {
        prompt: String(q.question || q.prompt || '').trim(),
        reference: String(q.reference || '').trim(),
        answer: ans,
        __choices: opts
      };
    });
    if (round.length < QUESTION_COUNT) throw new Error('Not enough event questions for a full round.');
  } else if (mode === 'daily') {
    const seedStr = `${dayId}|ALL`; // same questions for everyone today (any category)
    round = buildDailyRound(categories, categoryId, QUESTION_COUNT, seedStr);
  } else {
    round = buildRound(categories, categoryId, QUESTION_COUNT);
  }
} catch (e) {
  console.error(e);
  alert(e.message || 'Could not build a round.');
  location.href = 'index.html';
}

let idx = 0;
let score = 0;
let streak = 0;
let locked = false;

let timeLeft = SECONDS_PER;
let timer = null;

function setHeader() {
  el('pillQ').textContent = `Q ${idx + 1}/${QUESTION_COUNT}`;
  el('pillScore').textContent = `Score: ${score}`;
  el('pillStreak').textContent = `Streak: ${streak}`;
}

function setProgress() {
  const pct = ((idx) / QUESTION_COUNT) * 100;
  el('progress').style.width = `${pct}%`;
}

function renderQuestion() {
  locked = false;
  timeLeft = SECONDS_PER;

  setHeader();
  setProgress();

  const q = round[idx];
  el('question').textContent = q.prompt;
  el('ref').textContent = q.reference ? `Reference: ${q.reference}` : '';

  const choices = Array.isArray(q.__choices) && q.__choices.length ? q.__choices : makeChoicesForQuestion(q, categoryAnswerPool, answerPool, 4);
  const box = el('choices');
  box.innerHTML = '';

  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = choice;
    btn.addEventListener('click', async () => {
      await ensureAudioStarted();
      try { await sfx.click(); } catch (_) {}
      handleAnswer(choice, btn);
    });
    box.appendChild(btn);
  });

  el('status').textContent = '';
  el('timerNum').textContent = String(timeLeft);

  clearInterval(timer);
  timer = setInterval(() => {
    timeLeft -= 1;
    el('timerNum').textContent = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) {
      clearInterval(timer);
      handleAnswer(null, null); // timeout
    }
  }, 1000);
}

function calcPoints(ok, secondsRemaining) {
  if (!ok) return 0;
  const base = 100;
  const speedBonus = Math.max(0, Math.floor(secondsRemaining * 4)); // up to 60-ish
  const streakBonus = streak >= 3 ? 25 : 0; // small reward for streaks
  return base + speedBonus + streakBonus;
}

async function finish(totalMs) {
  clearInterval(timer);

  const correct = round.filter(q => q.__correct).length;

  let docId = '';
  try {
    docId = await saveScore({
      name: playerName,
      playerKey,
      dailyKey: mode === 'daily' ? dailyKey : '',
      category: catTitle,
      categoryId,
      score,
      correct,
      total: QUESTION_COUNT,
      ms: totalMs,
      seasonId,
      dayId,
      mode,
      eventSlug: (mode === 'event' ? eventSlug : '')
    }) || '';
  } catch (e) {
    console.error(e);
    // Don't block the user at the end of the game.
    docId = '';
  }

  const params = new URLSearchParams({
    name: playerName,
    category: catTitle,
    score: String(score),
    correct: String(correct),
    total: String(QUESTION_COUNT),
    mode,
    seasonId,
    dayId,
    docId
  });
  location.href = `result.html?${params.toString()}`;
}

let roundStart = performance.now();

let __audioStarted = false;
async function ensureAudioStarted() {
  if (__audioStarted) return;
  __audioStarted = true;
  await unlockAudio();
  startMusic();
}

function handleAnswer(choice, btnEl) {
  if (locked) return;
  locked = true;
  clearInterval(timer);

  const q = round[idx];
  const ok = choice !== null && answerMatches(q.answer, choice);
  q.__correct = ok;

  // Sounds
  try {
    if (choice === null) { sfx.wrong(); }
    else if (ok) { sfx.correct(); }
    else { sfx.wrong(); }
  } catch (_) {}

  // Visual feedback
  const buttons = Array.from(el('choices').querySelectorAll('button.choice'));
  buttons.forEach(b => {
    const text = b.textContent;
    const isCorrect = answerMatches(q.answer, text);
    if (isCorrect) b.classList.add('correct');
    if (choice !== null && text === choice && !isCorrect) b.classList.add('wrong');
    b.disabled = true;
  });

  if (ok) {
    streak += 1;
  } else {
    streak = 0;
  }

  const pts = calcPoints(ok, timeLeft);
  score += pts;

  el('status').textContent = ok ? `✅ Correct! +${pts}` : (choice === null ? '⏱️ Time!' : '❌ Wrong!');
  setHeader();

  setTimeout(() => {
    idx += 1;
    if (idx >= QUESTION_COUNT) {
      const totalMs = Math.round(performance.now() - roundStart);
      finish(totalMs);
    } else {
      renderQuestion();
    }
  }, 650);
}

(function(){
  const quitEl = document.getElementById('quit');
  if (!quitEl) return;
  quitEl.addEventListener('click', () => {
    if (confirm('Quit and return to Home?')) location.href = 'index.html';
  });
})();
renderQuestion();