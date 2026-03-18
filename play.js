import { initAudioUI, unlockAudio, startMusic, sfx } from './audio.js';
import { loadCategories, buildRound, buildDailyRound, makeChoicesForQuestion, answerMatches, pickCanonicalAnswer } from './trivia.js';
import { saveScore, hasDailyAttempt, normalizePlayerKey } from './scores.js';

const qs = new URLSearchParams(location.search);
initAudioUI();
const playerName = qs.get('name') || 'Player';
const categoryIdParam = qs.get('category') || '__ALL__';
const mode = (qs.get('mode') || 'daily').toLowerCase() === 'practice' ? 'practice' : 'daily';
const categoryId = (mode === 'daily') ? '__ALL__' : categoryIdParam;

// Age group (daily only) — read from URL param, fall back to localStorage
const rawAgeGroup = qs.get('ageGroup') || localStorage.getItem('bt_ageGroup') || 'adult';
const ageGroup = (rawAgeGroup === 'kid') ? 'kid' : 'adult';

// Locked competitive settings
const QUESTION_COUNT = 10;
const SECONDS_PER = 15;

const el = (id) => document.getElementById(id);

el('pillName').textContent = playerName;

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

// Build a global pool of answers for distractors
const answerPool = Array.from(new Set(categories.flatMap(c => (c.questions || []).map(q => pickCanonicalAnswer(q.answer)))));

const categoryAnswerPool = (categoryId === '__ALL__') ? answerPool : Array.from(new Set((categories.find(c => c.id === categoryId)?.questions || []).map(q => pickCanonicalAnswer(q.answer))));

const catTitle = categoryId === '__ALL__'
  ? 'All Categories'
  : (categories.find(c => c.id === categoryId)?.title || 'Category');

el('pillCat').textContent = catTitle;
el('pillMode').textContent = mode === 'daily' ? 'Daily Challenge' : 'Practice';

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

// Start music as soon as the play page loads (user already gave a gesture on the start screen)
unlockAudio().then(() => startMusic()).catch(() => {});

let round = [];
try {
  if (mode === 'daily') {
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

  let choices = makeChoicesForQuestion(q, categoryAnswerPool, answerPool, 4);
// Safety: always render exactly 4 clean, unique choices.
choices = Array.from(new Set(choices)).map(c => String(c || '').trim()).filter(c => c && c !== '—');
if (choices.length > 4) choices = choices.slice(0, 4);
if (choices.length < 4) {
  for (const a of answerPool) {
    const v = String(a || '').trim();
    if (!v || v === '—') continue;
    if (!choices.some(x => x.toLowerCase() === v.toLowerCase())) choices.push(v);
    if (choices.length >= 4) break;
  }
}

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
      ageGroup: mode === 'daily' ? ageGroup : ''
    }) || '';
  } catch (e) {
    console.error(e);
    // Don't block the user at the end of the game.
    docId = '';
  }

  // Save review data for the result page
  try {
    const reviewData = round.map((q, i) => ({
      num: i + 1,
      prompt: q.prompt,
      answer: q.answer,
      playerAnswer: q.__playerAnswer ?? null,
      correct: !!q.__correct,
    }));
    sessionStorage.setItem('bb_review', JSON.stringify(reviewData));
  } catch (_) {}

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
  q.__playerAnswer = choice; // null = timeout

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