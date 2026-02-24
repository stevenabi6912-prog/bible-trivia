import { loadCategories, buildRound, makeChoices, pickCanonicalAnswer, answerMatches } from './trivia.js';
import { saveScore } from './scores.js';

const qs = new URLSearchParams(location.search);
const playerName = qs.get('name') || 'Player';
const categoryId = qs.get('category') || '__ALL__';
const questionCount = parseInt(qs.get('count') || '10', 10);
const secondsPer = parseInt(qs.get('seconds') || '10', 10);

const el = (id) => document.getElementById(id);
el('pillName').textContent = playerName;

const data = await loadCategories();
const categories = data.categories;

const catTitle = categoryId === '__ALL__' ? 'All Categories' : (categories.find(c => c.id === categoryId)?.title || 'Category');
el('pillCat').textContent = catTitle;
el('qTotal').textContent = String(questionCount);

const round = buildRound(categories, categoryId, questionCount);

// Build a global answer pool for distractors (within chosen pool if not ALL)
const pools = categoryId === '__ALL__' ? categories : categories.filter(c => c.id === categoryId);
const answerPool = pools.flatMap(c => c.questions.map(q => pickCanonicalAnswer(q.answer))).filter(Boolean);

let idx = 0;
let score = 0;
let streak = 0;
let locked = false;
let t0 = 0;
let timer = null;
let remaining = secondsPer;

function setStatus(msg) { el('status').textContent = msg; }

function updateBar() {
  const frac = Math.max(0, remaining) / secondsPer;
  el('bar').style.transform = `scaleX(${frac})`;
}

function startTimer() {
  clearInterval(timer);
  remaining = secondsPer;
  updateBar();
  timer = setInterval(() => {
    remaining -= 0.1;
    updateBar();
    if (remaining <= 0) {
      clearInterval(timer);
      handleAnswer(null); // timeout
    }
  }, 100);
}

function render() {
  locked = false;
  const q = round[idx];
  el('qNum').textContent = String(idx + 1);
  el('prompt').textContent = q.prompt;
  el('ref').textContent = q.reference ? `Reference: ${q.reference}` : '';

  const correct = pickCanonicalAnswer(q.answer);
  const choices = makeChoices(correct, answerPool, 4);

  const container = el('choices');
  container.innerHTML = '';
  for (const c of choices) {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = c;
    btn.addEventListener('click', () => handleAnswer(c, btn));
    container.appendChild(btn);
  }

  el('score').textContent = String(score);
  el('streak').textContent = String(streak);
  setStatus('');
  t0 = performance.now();
  startTimer();
}

function computePoints(isCorrect) {
  if (!isCorrect) return 0;
  const base = 100;
  const elapsed = (performance.now() - t0) / 1000;
  const speedBonus = Math.max(0, Math.floor((secondsPer - elapsed) * 8)); // up to ~80
  const streakBonus = streak >= 2 ? 25 : 0; // kick in after 3rd correct
  return base + speedBonus + streakBonus;
}

async function finish(totalMs) {
  clearInterval(timer);
  const total = questionCount;
  const correct = round.filter(q => q.__correct).length;

  // Save score
  try {
    await saveScore({
      name: playerName,
      category: catTitle,
      categoryId,
      score,
      correct,
      total,
      ms: totalMs
    });
  } catch (e) {
    console.error(e);
    alert('Score could not be saved. Check Firebase config + Firestore rules.');
  }

  const params = new URLSearchParams({ name: playerName, category: catTitle, score: String(score), correct: String(correct), total: String(total) });
  location.href = `result.html?${params.toString()}`;
}

let roundStart = performance.now();

function handleAnswer(choice, btnEl) {
  if (locked) return;
  locked = true;
  clearInterval(timer);

  const q = round[idx];
  const ok = choice !== null && answerMatches(q.answer, choice);
  q.__correct = ok;

  const container = el('choices');
  const correctText = pickCanonicalAnswer(q.answer);

  // mark buttons
  [...container.children].forEach(b => {
    const isCorrectChoice = b.textContent === correctText;
    if (isCorrectChoice) b.classList.add('good');
    if (!ok && b.textContent === choice) b.classList.add('bad');
    b.disabled = true;
  });

  if (ok) {
    streak += 1;
    const pts = computePoints(true);
    score += pts;
    setStatus(`✅ Correct! +${pts}`);
  } else {
    streak = 0;
    setStatus(choice === null ? `⏰ Time! Answer: ${correctText}` : `❌ Nope. Answer: ${correctText}`);
  }

  el('score').textContent = String(score);
  el('streak').textContent = String(streak);

  setTimeout(async () => {
    idx += 1;
    if (idx >= round.length) {
      const totalMs = Math.round(performance.now() - roundStart);
      await finish(totalMs);
      return;
    }
    render();
  }, 900);
}

el('quit').addEventListener('click', () => {
  location.href = 'index.html';
});

render();
