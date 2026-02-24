export async function loadCategories() {
  const res = await fetch('./questions.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load questions.json');
  const data = await res.json();
  return data;
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

export function makeChoices(correctAnswer, allAnswersPool, k = 4) {
  const correct = normalizeAnswer(correctAnswer);
  const choices = new Set([correct]);

  // Fill with random distractors from the global pool
  const pool = allAnswersPool.map(normalizeAnswer).filter(Boolean).filter(a => a !== correct);
  shuffle(pool);

  for (const a of pool) {
    choices.add(a);
    if (choices.size >= k) break;
  }

  // If pool was tiny, duplicate-safe fallback
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
