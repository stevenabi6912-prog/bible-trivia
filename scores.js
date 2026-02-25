import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, orderBy, limit as qLimit, where, onSnapshot, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export function normalizePlayerKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

export async function hasDailyAttempt(dailyKey) {
  if (!dailyKey) return false;
  const q = query(
    collection(db, 'scores'),
    where('dailyKey', '==', String(dailyKey)),
    qLimit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function saveScore({
  name, category, categoryId,
  score, correct, total, ms,
  seasonId, dayId, mode,
  playerKey, dailyKey
}) {
  const clean = {
    name: String(name).slice(0, 18),
    playerKey: String(playerKey || normalizePlayerKey(name)).slice(0, 24),

    category: String(category).slice(0, 40),
    categoryId: String(categoryId || '').slice(0, 60),

    score: Number(score) || 0,
    correct: Number(correct) || 0,
    total: Number(total) || 0,
    ms: Number(ms) || 0,

    seasonId: String(seasonId || '').slice(0, 12),
    dayId: String(dayId || '').slice(0, 10),
    mode: String(mode || 'practice').slice(0, 12),

    // For Daily Challenge: single-field lookup to enforce “one attempt”
    dailyKey: dailyKey ? String(dailyKey).slice(0, 64) : '',

    createdAt: serverTimestamp()
  };
  await addDoc(collection(db, 'scores'), clean);
}

export function subscribeLeaderboard({ category, limit, seasonId, dayId, mode, onData, onError }) {
  const clauses = [collection(db, 'scores')];

  if (mode) clauses.push(where('mode', '==', mode));
  if (seasonId) clauses.push(where('seasonId', '==', seasonId));
  if (dayId) clauses.push(where('dayId', '==', dayId));

  // Category filter uses stored display title (keeps UI simple)
  if (category && category !== '__ALL__') {
    clauses.push(where('category', '==', category));
  }

  clauses.push(orderBy('score', 'desc'));
  clauses.push(orderBy('correct', 'desc'));
  clauses.push(orderBy('ms', 'asc'));
  clauses.push(qLimit(limit));

  const q = query(...clauses);
  return onSnapshot(q, (snap) => {
    const scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onData(scores);
  }, onError);
}
