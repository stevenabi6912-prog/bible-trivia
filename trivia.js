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

export function inferExpectedType(prompt, correctLabel) {
  const p = (prompt || '').trim().toLowerCase();
  const a = (correctLabel || '').trim();

  // Numeric / time answers
  if (/\d/.test(a)) return 'number';
  if (p.startsWith('how many') || p.startsWith('how long')) return 'number';
  if (/(year|years|day|days|month|months|week|weeks|cubit|cubits|hour|hours|times)\b/i.test(a)) return 'number';

  // People / names
  if (p.startsWith('who') || p.startsWith('whose')) return 'name';

  // Places
  if (p.startsWith('where') || p.includes('what city') || p.includes('what country') || p.includes('what land') || p.includes('in which city')) return 'place';

  // Default
  return 'thing';
}

function looksLikeName(s) {
  const t = (s || '').trim();
  if (!t) return false;
  // Avoid obvious non-names
  if (/[,:]/.test(t)) return false;
  if (/(^a\b|^an\b|^the\b)/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 3) return false;
  // Accept "Paul", "King Saul", "John the Baptist" (3 words)
  return words.every(w => /^[A-Z][A-Za-z'’\-\.]*$/.test(w));
}

function looksLikePlace(s) {
  const t = (s || '').trim();
  if (!t) return false;
  // Simple heuristic: capitalized and contains common place tokens
  if (/(Mount|Mt\.?|Sea|River|Valley|Lake|Desert)\b/.test(t)) return true;
  // Often places are single/two-word capitalized
  const words = t.split(/\s+/);
  if (words.length > 3) return false;
  return words.every(w => /^[A-Z][A-Za-z'’\-\.]*$/.test(w));
}

function inferLabelType(prompt, label) {
  const expected = inferExpectedType(prompt, label);
  if (expected === 'number') return 'number';
  if (expected === 'name') return looksLikeName(label) ? 'name' : 'thing';
  if (expected === 'place') return looksLikePlace(label) ? 'place' : 'thing';
  // For "thing", we don't enforce much.
  if (/\d/.test(label)) return 'number';
  if (looksLikeName(label)) return 'name';
  if (looksLikePlace(label)) return 'place';
  return 'thing';
}

function scoreCandidate(correctLabel, candLabel, expectedType) {
  const c = correctLabel || '';
  const a = candLabel || '';
  const lenDiff = Math.abs(a.length - c.length);
  const wordDiff = Math.abs(a.split(/\s+/).length - c.split(/\s+/).length);
  let score = lenDiff + 10 * wordDiff;

  if (expectedType === 'number') {
    const unitMatch = (c.match(/\b(years?|days?|months?|weeks?|cubits?|hours?|times)\b/i) || [])[0];
    if (unitMatch && !new RegExp(`\\b${unitMatch}\\b`, 'i').test(a)) score += 50;
  }
  return score;
}

export function makeChoicesForQuestion(q, categoryAnswersPool, allAnswersPool, k = 4) {
  const correctLabel = pickCanonicalAnswer(q.answer);
  const prompt = q.prompt || '';

  const expectedType = inferExpectedType(prompt, correctLabel);

  const choices = new Set([correctLabel]);

  // Manual overrides: q.distractors = ["...", "...", "..."]
  if (Array.isArray(q.distractors)) {
    for (const d of q.distractors) {
      const dl = normalizeAnswer(d);
      if (dl && dl !== correctLabel) choices.add(dl);
      if (choices.size >= k) break;
    }
  }

  // Canonicalize pools
  const catPool = (categoryAnswersPool || [])
    .map(normalizeAnswer)
    .filter(Boolean)
    .filter(a => a !== correctLabel);

  const globalPool = (allAnswersPool || [])
    .map(normalizeAnswer)
    .filter(Boolean)
    .filter(a => a !== correctLabel);

  // Build candidate list with type enforcement for strict types
  const wantStrict = (expectedType === 'name' || expectedType === 'number' || expectedType === 'place');

  function filterStrict(pool) {
    if (!wantStrict) return Array.from(new Set(pool));
    const out = [];
    for (const a of pool) {
      const t = inferLabelType(prompt, a);
      if (t === expectedType) out.push(a);
    }
    return Array.from(new Set(out));
  }

  const candidates = filterStrict(catPool);
  const globalCandidates = filterStrict(globalPool);

  // Sort by "plausibility" (shape similarity)
  candidates.sort((a, b) => scoreCandidate(correctLabel, a, expectedType) - scoreCandidate(correctLabel, b, expectedType));
  globalCandidates.sort((a, b) => scoreCandidate(correctLabel, a, expectedType) - scoreCandidate(correctLabel, b, expectedType));

  for (const a of candidates) {
    choices.add(a);
    if (choices.size >= k) break;
  }
  if (choices.size < k) {
    for (const a of globalCandidates) {
      choices.add(a);
      if (choices.size >= k) break;
    }
  }
  // Final fallback if still short
  if (choices.size < k) {
    for (const a of globalPool) {
      choices.add(a);
      if (choices.size >= k) break;
    }
  }

  return shuffle(Array.from(choices));
}

// Backward-compatible wrapper (older calls)
export function makeChoices(correctAnswerField, allAnswersPool, k = 4) {
  const q = { prompt: '', answer: correctAnswerField };
  return makeChoicesForQuestion(q, allAnswersPool, allAnswersPool, k);
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
