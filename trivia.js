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
  let s = String(a ?? '').replace(/\s+/g, ' ').trim();
  // Strip wrapping quotes
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Normalize parenthetical synonyms: "Donkey (Ass)" -> "Donkey"
  s = s.replace(/\s*\([^\)]*\)\s*$/g, '').trim();
  return s;
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

  // Highly specific patterns first
  if (/\bwhat\s+weapon\b/.test(p) || /\bwhich\s+weapon\b/.test(p)) return 'weapon';
  if (/\bwhat\s+bird\b/.test(p) || /\bwhich\s+bird\b/.test(p) || (p.includes('bird') && p.includes('value'))) return 'bird';
  if (/\bwhat\s+insect\b/.test(p) || /\bwhich\s+insect\b/.test(p)) return 'insect';
  if (/\bwhat\s+(two|three|four)\s+animals\b/.test(p) || /\banimals\b/.test(p)) return 'animal';
  if (/\bhow\s+tall\b/.test(p) || /\bhow\s+high\b/.test(p)) return 'measure';
  if (/\bantichrist\b/.test(p) || /\bwhat\s+makes\s+someone\b/.test(p)) return 'doctrine';
  if (/\b(win|won)\b/.test(p) && (p.includes('or') || p.includes('either'))) return 'eitheror';

  // Numeric / time answers
  if (/\d/.test(a)) return 'number';
  if (p.startsWith('how many') || p.startsWith('how long')) return 'number';
  if (/(year|years|day|days|month|months|week|weeks|cubit|cubits|span|shekel|shekels|talent|talents|piece|pieces|hour|hours|times)\b/i.test(a)) return 'number';

  // People / names
  if (p.startsWith('who') || p.startsWith('whose')) return 'name';

  // Places
  if (
    p.startsWith('where') ||
    p.includes('what city') ||
    p.includes('what town') ||
    p.includes('what place') ||
    p.includes('what country') ||
    p.includes('what land') ||
    p.includes('in which city')
  ) return 'place';

  return 'thing';
}

// Choice-quality pools (small, curated lists)
const BIRDS = ['Sparrow','Dove','Raven','Eagle','Quail','Owl','Hawk','Vulture','Stork','Pelican','Swallow'];
const INSECTS = ['Locusts','Bees','Flies','Gnats','Worms'];
const ANIMALS = ['Lion','Bear','Donkey','Camel','Ox','Sheep','Goat','Serpent','Horse','Dog','Fish'];
const WEAPONS = ['Javelin','Spear','Sword','Bow','Arrow','Sling','Dagger','Staff'];

function hasReferenceJunk(s) {
  const t = (s || '').trim();
  if (!t) return false;
  if (/^as to the\b/i.test(t)) return true;
  if (/\b(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\b/i.test(t)) return true;
  if (/\d+\s*:\s*\d+/.test(t)) return true;
  return false;
}

function measureUnit(s) {
  const t = (s || '').toLowerCase();
  if (t.includes('cubit')) return 'cubit';
  if (t.includes('span')) return 'span';
  if (t.includes('piece') && t.includes('silver')) return 'silver';
  if (t.includes('shekel')) return 'shekel';
  if (t.includes('talent')) return 'talent';
  if (t.includes('year')) return 'year';
  if (t.includes('month')) return 'month';
  if (t.includes('day')) return 'day';
  return '';
}

function isValidByType(expectedType, prompt, correctLabel, cand) {
  const c = (cand || '').trim();
  if (!c) return false;
  if (c.toLowerCase() === (correctLabel || '').toLowerCase()) return false;

  // Never allow obvious junk as an option
  if (hasReferenceJunk(c) && !hasReferenceJunk(correctLabel)) return false;
  if (c.length > 80) return false;

  if (expectedType === 'bird') return BIRDS.includes(c);
  if (expectedType === 'insect') return INSECTS.includes(c);
  if (expectedType === 'animal') return ANIMALS.includes(c) || /\b(and|&)\b/i.test(c); // allow pairs
  if (expectedType === 'weapon') return WEAPONS.includes(c) || /(spear|javelin|sword|bow|arrow|sling|dagger|staff)/i.test(c);
  if (expectedType === 'doctrine') return /^(denying|confessing|refusing|not confessing|not believing|teaching|saying)/i.test(c) || c.toLowerCase().includes('jesus');
  if (expectedType === 'eitheror') return true; // handled separately

  if (expectedType === 'measure') {
    const u = measureUnit(correctLabel);
    if (u) return measureUnit(c) === u || (u === 'cubit' && c.toLowerCase().includes('span'));
    return /\b(cubit|span)\b/i.test(c);
  }

  if (expectedType === 'number') {
    const u = measureUnit(correctLabel);
    if (u) return measureUnit(c) === u || (u === 'cubit' && c.toLowerCase().includes('span'));
    return /\d/.test(c);
  }

  if (expectedType === 'name') return looksLikeName(c);
  if (expectedType === 'place') return looksLikePlace(c);

  return true;
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

  // If we can't find a usable answer, fail safe
  if (!correctLabel) {
    return shuffle(['(Missing answer)','(Missing answer)','(Missing answer)','(Missing answer)']).slice(0, k);
  }

  const expectedType = inferExpectedType(prompt, correctLabel);

  // Special: either/or win questions — keep it sane
  if (expectedType === 'eitheror') {
    const m = prompt.match(/did\s+(.+?)\s+or\s+(.+?)\s+win\?/i);
    const a = m ? normalizeAnswer(m[1]) : '';
    const b = m ? normalizeAnswer(m[2]) : '';
    const base = [correctLabel, a, b, 'Neither'];
    const uniq = [];
    for (const x of base) {
      const v = normalizeAnswer(x);
      if (v && !uniq.some(u => u.toLowerCase() === v.toLowerCase())) uniq.push(v);
    }
    while (uniq.length < k) uniq.push('Neither');
    return shuffle(uniq.slice(0, k));
  }

  const choices = [correctLabel];

  // 1) Use manual distractors if present, but only if they match type
  if (Array.isArray(q.distractors)) {
    for (const d of q.distractors) {
      const dl = normalizeAnswer(d);
      if (!dl) continue;
      if (!isValidByType(expectedType, prompt, correctLabel, dl)) continue;
      if (!choices.some(x => x.toLowerCase() === dl.toLowerCase())) choices.push(dl);
      if (choices.length >= k) break;
    }
  }

  // 2) Use category pool (filtered)
  const catPool = (categoryAnswersPool || []).map(normalizeAnswer).filter(Boolean);
  for (const a of catPool) {
    if (choices.length >= k) break;
    if (!isValidByType(expectedType, prompt, correctLabel, a)) continue;
    if (!choices.some(x => x.toLowerCase() === a.toLowerCase())) choices.push(a);
  }

  // 3) Global pool (filtered)
  const globalPool = (allAnswersPool || []).map(normalizeAnswer).filter(Boolean);
  for (const a of globalPool) {
    if (choices.length >= k) break;
    if (!isValidByType(expectedType, prompt, correctLabel, a)) continue;
    if (!choices.some(x => x.toLowerCase() === a.toLowerCase())) choices.push(a);
  }

  // 4) Pad by type if still short
  const padPools = {
    bird: BIRDS,
    insect: INSECTS,
    animal: ANIMALS,
    weapon: WEAPONS,
    measure: ['Five cubits and a span','Six cubits and a span','Seven cubits and a span','Ten cubits'],
    number: ['3','7','10','12','40','70','100','1000'],
    doctrine: ['Denying that Jesus was come in the flesh','Not confessing Jesus Christ is come in the flesh','Refusing the truth about Christ','Teaching another doctrine']
  };
  const pad = padPools[expectedType] || [];
  for (const a of pad) {
    if (choices.length >= k) break;
    const v = normalizeAnswer(a);
    if (!isValidByType(expectedType, prompt, correctLabel, v)) continue;
    if (!choices.some(x => x.toLowerCase() === v.toLowerCase())) choices.push(v);
  }

  // Final: guarantee correct is present, and exactly k choices
  const uniq = [];
  for (const x of choices) {
    const v = normalizeAnswer(x);
    if (v && !uniq.some(u => u.toLowerCase() === v.toLowerCase())) uniq.push(v);
  }
  if (!uniq.some(u => u.toLowerCase() === correctLabel.toLowerCase())) uniq.unshift(correctLabel);

  return shuffle(uniq.slice(0, k));
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
