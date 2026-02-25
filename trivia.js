export async function loadCategories() {
  const res = await fetch('./questions.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load questions.json');
  const data = await res.json();
  return data;
}


function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleSeeded(arr, seedStr) {
  const rnd = mulberry32(hashStringToSeed(seedStr));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeAnswer(a) {
  return String(a || '').trim();
}

export function buildRound(allCategories, selectedCategoryId, questionCount) {
  const pools = selectedCategoryId === '__ALL__'
    ? allCategories
    : allCategories.filter(c => c.id === selectedCategoryId);

  const questions = pools.flatMap(c => c.questions.map(q => ({...q, categoryId: c.id, categoryTitle: c.title})));

  if (questions.length < questionCount) {
    throw new Error(`Not enough questions in that category. Needed ${questionCount}, found ${questions.length}.`);
  }

  shuffle(questions);
  return questions.slice(0, questionCount);
}


export function buildDailyRound(allCategories, selectedCategoryId, questionCount, seedStr) {
  const pools = selectedCategoryId === '__ALL__'
    ? allCategories
    : allCategories.filter(c => c.id === selectedCategoryId);

  const questions = pools.flatMap(c => c.questions.map(q => ({...q, categoryId: c.id, categoryTitle: c.title})));

  if (questions.length < questionCount) {
    throw new Error(`Not enough questions in that category. Needed ${questionCount}, found ${questions.length}.`);
  }

  // Deterministic shuffle based on seedStr so everyone gets the same set for the day
  shuffleSeeded(questions, seedStr);
  return questions.slice(0, questionCount);
}



function classifyAnswerType(answer) {
  const a = normalizeAnswer(answer);
  if (!a) return 'other';

  // Number/time-ish (contains digits or common time words)
  if (/[0-9]/.test(a) || /\b(years?|days?|months?|weeks?|cubits?)\b/i.test(a)) return 'number';

  // Very short single-word answers are often objects/places/names; use capitalization + stopwords
  const words = a.split(/\s+/).filter(Boolean);

  // Place hints
  if (/\b(Jerusalem|Bethlehem|Nazareth|Galilee|Capernaum|Samaria|Judea|Judah|Israel|Egypt|Canaan|Babylon|Rome|Corinth|Ephesus|Philippi|Thessalonica|Damascus|Jordan|Sinai)\b/i.test(a)) {
    return 'place';
  }
  if (/\b(mount|mountain|river|sea|wilderness|valley|desert|city|land)\b/i.test(a)) return 'place';

  // Person-ish: 1-3 capitalized words, no leading article, not a sentence
  const tooLong = a.length > 28 || words.length > 4;
  const hasPunct = /[\.,;:!?]/.test(a);
  const startsWithArticle = /^(the|a|an)\b/i.test(a);

  const capWords = words.filter(w => /^[A-Z][a-z]+(?:['-][A-Z][a-z]+)?$/.test(w));
  const looksLikeName = !tooLong && !hasPunct && !startsWithArticle && capWords.length >= 1 && capWords.length === words.length;

  if (looksLikeName) return 'person';

  // Weapon/thing hints
  if (/\b(sword|spear|bow|arrow|ox goad|rod|staff|ark|altar|cubit|stone|bread|manna|crown)\b/i.test(a)) return 'thing';

  return 'other';
}

function inferQuestionType(questionText, correctLabel) {
  const q = String(questionText || '').trim().toLowerCase();
  if (!q) return classifyAnswerType(correctLabel);

  if (q.startsWith('who') || q.includes(' who ') || q.includes('whom') || q.startsWith('whose') || q.includes(' which king') || q.includes(' which prophet') || q.includes(' which judge')) {
    return 'person';
  }
  if (q.startsWith('where') || q.includes(' where ')) return 'place';
  if (q.startsWith('how many') || q.startsWith('how long') || q.startsWith('how old') || q.startsWith('when') || q.includes(' how many ') || q.includes(' how long ') || q.includes(' how old ')) {
    return 'number';
  }
  if (q.includes('what city') || q.includes('what land') || q.includes('what river') || q.includes('what sea') || q.includes('what mountain')) return 'place';
  if (q.includes('what weapon') || q.includes('what did') || q.startsWith('what')) {
    // Use the answer to break ties
    const aType = classifyAnswerType(correctLabel);
    return aType === 'person' ? 'person' : (aType === 'place' ? 'place' : 'thing');
  }
  return classifyAnswerType(correctLabel);
}

function buildTypedPools(allQuestionsOrAnswers) {
  const pools = { person: [], place: [], number: [], thing: [], other: [] };

  // Accept either a list of raw answers or a list of question objects with {answer, question}
  for (const item of (allQuestionsOrAnswers || [])) {
    const ansField = (item && typeof item === 'object' && 'answer' in item) ? item.answer : item;
    const label = pickCanonicalAnswer(ansField);
    const type = (item && typeof item === 'object' && 'question' in item)
      ? inferQuestionType(item.question, label)
      : classifyAnswerType(label);

    if (!label) continue;
    pools[type] = pools[type] || [];
    pools[type].push(label);
  }

  // De-dupe each pool
  for (const k of Object.keys(pools)) {
    const seen = new Set();
    pools[k] = pools[k].map(normalizeAnswer).filter(Boolean).filter(a => {
      if (seen.has(a)) return false;
      seen.add(a);
      return true;
    });
  }

  return pools;
}

export function makeChoicesForQuestion(q, allQuestions, k = 4) {
  const correctLabel = pickCanonicalAnswer(q.answer);
  const qType = inferQuestionType(q.question, correctLabel);

  const typed = buildTypedPools(allQuestions);
  const primaryPool = typed[qType] || typed.other;

  // Start with any manual distractors on the question (hybrid mode)
  const manual = Array.isArray(q.distractors) ? q.distractors.map(normalizeAnswer).filter(Boolean) : [];
  const choices = new Set([correctLabel, ...manual].filter(Boolean));

  // Build candidate pool: prefer same type, then widen
  const widen = [
    primaryPool,
    typed.person,
    typed.place,
    typed.number,
    typed.thing,
    typed.other,
  ];

  for (const pool of widen) {
    const candidates = (pool || []).map(normalizeAnswer).filter(Boolean).filter(a => a !== correctLabel);
    shuffle(candidates);
    for (const a of candidates) {
      if (choices.size >= k) break;
      choices.add(a);
    }
    if (choices.size >= k) break;
  }

  // Final safety fill
  while (choices.size < k) choices.add('—');

  // Extra safety: avoid options that are wildly long compared to the correct answer
  const arr = Array.from(choices);
  const maxLen = Math.max(24, correctLabel.length * 3);
  const cleaned = arr.map(a => (a.length > maxLen ? a.slice(0, maxLen - 1) + '…' : a));

  return shuffle(cleaned);
}


export function makeChoices(correctAnswerField, allAnswersPool, k = 4) {
  // Backwards-compatible fallback: if given a question object, route to the smarter generator.
  if (correctAnswerField && typeof correctAnswerField === 'object' && 'answer' in correctAnswerField) {
    return makeChoicesForQuestion(correctAnswerField, allAnswersPool, k);
  }

  const correctLabel = pickCanonicalAnswer(correctAnswerField);
  const typed = buildTypedPools(allAnswersPool);
  const aType = classifyAnswerType(correctLabel);
  const primaryPool = typed[aType] || typed.other;

  const choices = new Set([correctLabel]);

  const widen = [
    primaryPool,
    typed.person,
    typed.place,
    typed.number,
    typed.thing,
    typed.other,
  ];

  for (const pool of widen) {
    const candidates = (pool || []).map(normalizeAnswer).filter(Boolean).filter(a => a !== correctLabel);
    shuffle(candidates);
    for (const a of candidates) {
      if (choices.size >= k) break;
      choices.add(a);
    }
    if (choices.size >= k) break;
  }

  while (choices.size < k) choices.add('—');
  return shuffle(Array.from(choices));
}

export function pickCanonicalAnswer(answerField) {
  if (Array.isArray(answerField)) return normalizeAnswer(answerField[0]);
  return normalizeAnswer(answerField);
}

export function answerMatches(answerField, chosen) {
  const c = normalizeAnswer(chosen).toLowerCase();
  if (Array.isArray(answerField)) return answerField.some(a => normalizeAnswer(a).toLowerCase() === c);
  return normalizeAnswer(answerField).toLowerCase() === c;
}
