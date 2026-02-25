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

// Build answer pools for distractors (better: same category + same type)
const pools = categoryId === '__ALL__' ? categories : categories.filter(c => c.id === categoryId);

// Answers only from the chosen pool (used as a fallback)
const answerPool = pools
  .flatMap(c => c.questions.map(q => pickCanonicalAnswer(q.answer)))
  .filter(Boolean);

// Answers from ALL categories (final fallback)
const globalAnswerPool = categories
  .flatMap(c => c.questions.map(q => pickCanonicalAnswer(q.answer)))
  .filter(Boolean);

// Per-category pools
const categoryAnswerPools = new Map(); // categoryId -> [answers]
const typedPoolsByCategory = new Map(); // categoryId -> {type: [answers]}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MONTHS = new Set([
  'january','february','march','april','may','june','july','august','september','october','november','december',
  // common biblical month name seen in many translations
  'nisan'
]);

const ANIMALS = new Set([
  'camel','ass','donkey','horse','ox','cow','bull','calf','sheep','lamb','goat','kid','ram',
  'fish','dove','pigeon','raven','eagle','lion','bear','wolf','dog','serpent','snake',
  'locust','bee','worm','sparrow'
]);

const BOOKS = new Set([
  'genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth','1 samuel','2 samuel',
  '1 kings','2 kings','1 chronicles','2 chronicles','ezra','nehemiah','esther','job','psalms','proverbs',
  'ecclesiastes','song of solomon','isaiah','jeremiah','lamentations','ezekiel','daniel','hosea','joel','amos',
  'obadiah','jonah','micah','nahum','habakkuk','zephaniah','haggai','zechariah','malachi',
  'matthew','mark','luke','john','acts','romans','1 corinthians','2 corinthians','galatians','ephesians',
  'philippians','colossians','1 thessalonians','2 thessalonians','1 timothy','2 timothy','titus','philemon',
  'hebrews','james','1 peter','2 peter','1 john','2 john','3 john','jude','revelation'
]);

const ORDINAL_WORDS = new Set([
  'first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth'
]);

const NUMBER_WORDS = new Set([
  'one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve',
  'thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand'
]);

function normalize(a) {
  return String(a || '').trim();
}

function classifyAnswer(answer, prompt = '') {
  const a = normalize(answer);
  const al = a.toLowerCase();
  const pl = String(prompt || '').trim().toLowerCase();

  // Months (either a month name OR an ordinal/digit month)
  if (MONTHS.has(al)) return 'month';
  if (/\bmonth\b/.test(pl)) {
    if (ORDINAL_WORDS.has(al)) return 'month';
    if (/^\d{1,2}(st|nd|rd|th)?(\s+month)?$/.test(al)) return 'month';
    if (/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+month$/.test(al)) return 'month';
  }

  // Numbers
  if (/^\d+[,:]?\d*$/.test(al)) return 'number';
  if (NUMBER_WORDS.has(al)) return 'number';
  if (ORDINAL_WORDS.has(al) && !/\bmonth\b/.test(pl)) return 'number';

  // Yes/No
  if (al === 'yes' || al === 'no') return 'boolean';

  // Bible book names
  if (BOOKS.has(al)) return 'book';

  // Animals
  if (ANIMALS.has(al)) return 'animal';

  // Prompt-driven hints
  if (pl.startsWith('who')) return 'person';
  if (pl.startsWith('where')) return 'place';
  if (pl.startsWith('when')) return 'time';

  return 'general';
}

function addToTypedPool(catId, type, answer) {
  if (!typedPoolsByCategory.has(catId)) typedPoolsByCategory.set(catId, {});
  const bucket = typedPoolsByCategory.get(catId);
  if (!bucket[type]) bucket[type] = [];
  bucket[type].push(answer);
}

for (const c of categories) {
  const answers = c.questions.map(q => pickCanonicalAnswer(q.answer)).filter(Boolean);
  categoryAnswerPools.set(c.id, answers);

  for (const q of c.questions) {
    const a = pickCanonicalAnswer(q.answer);
    if (!a) continue;
    const t = classifyAnswer(a, q.prompt);
    addToTypedPool(c.id, t, a);
  }
}

function makePlausibleChoices(correctAnswer, q, k = 4) {
  const correct = normalize(correctAnswer);
  const catId = q.categoryId;
  const type = classifyAnswer(correct, q.prompt);

  const catPool = (categoryAnswerPools.get(catId) || []).map(normalize).filter(Boolean);
  const typed = (typedPoolsByCategory.get(catId)?.[type] || []).map(normalize).filter(Boolean);

  // Start with same-type within the same category
  let pool = Array.from(new Set([...typed, ...catPool]))
    .filter(a => a && a !== correct);

  // Prefer similar length/word count to avoid nonsense mixes
  const wc = correct.split(/\s+/).filter(Boolean).length || 1;
  const similar = pool.filter(a => {
    const w = a.split(/\s+/).filter(Boolean).length || 1;
    return Math.abs(w - wc) <= 1;
  });
  if (similar.length >= (k - 1)) pool = similar;

  // If still short, widen gradually
  if (pool.length < (k - 1)) {
    pool = Array.from(new Set([...pool, ...answerPool.filter(a => a !== correct)]));
  }
  if (pool.length < (k - 1)) {
    pool = Array.from(new Set([...pool, ...globalAnswerPool.filter(a => a !== correct)]));
  }

  shuffleArray(pool);

  const choices = [correct];
  for (const a of pool) {
    if (choices.includes(a)) continue;
    choices.push(a);
    if (choices.length >= k) break;
  }

  while (choices.length < k) choices.push('—');
  return shuffleArray(choices);
}



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
  const choices = makePlausibleChoices(correct, q, 4);

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
