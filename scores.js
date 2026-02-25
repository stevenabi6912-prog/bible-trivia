import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, orderBy, limit as qLimit, where, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveScore({ name, category, categoryId, score, correct, total, ms }) {
  const clean = {
    name: String(name).slice(0, 18),
    category: String(category).slice(0, 40),
    categoryId: String(categoryId || '').slice(0, 60),
    score: Number(score) || 0,
    correct: Number(correct) || 0,
    total: Number(total) || 0,
    ms: Number(ms) || 0,
    createdAt: serverTimestamp()
  };
  await addDoc(collection(db, 'scores'), clean);
}

export function subscribeLeaderboard({ category, limit, seasonId, dayId, mode, onData, onError }) {
  const clauses = [collection(db, 'scores')];

  // Filters
  if (mode) clauses.push(where('mode', '==', mode));
  if (seasonId) clauses.push(where('seasonId', '==', seasonId));
  if (dayId) clauses.push(where('dayId', '==', dayId));

  // Category filter uses stored display title (keeps UI simple)
  if (category && category !== '__ALL__') {
    clauses.push(where('category', '==', category));
  }

  // Ordering (tie-breakers)
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

