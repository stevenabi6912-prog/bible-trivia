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

export function subscribeLeaderboard({ category, limit, onData, onError }) {
  let q;
  if (category && category !== '__ALL__') {
    q = query(
      collection(db, 'scores'),
      where('category', '==', category),
      orderBy('score', 'desc'),
      orderBy('ms', 'asc'),
      qLimit(limit)
    );
  } else {
    q = query(
      collection(db, 'scores'),
      orderBy('score', 'desc'),
      orderBy('ms', 'asc'),
      qLimit(limit)
    );
  }

  return onSnapshot(q, (snap) => {
    const scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onData(scores);
  }, onError);
}
