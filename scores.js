import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, orderBy, limit as qLimit, where, onSnapshot, getDocs, getDoc, doc
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
  const ref = await addDoc(collection(db, 'scores'), clean);
  return ref.id;
}

export 
function subscribeLeaderboard({ category, limit, seasonId, dayId, mode, onData, onError }) {
  // Firestore composite indexes can be a pain on hobby projects.
  // We prefer simple queries (single where, no orderBy) and do sorting/filtering client-side.
  // This avoids "failed-precondition / index required" errors.

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));

  // Build the simplest possible query:
  // - Daily leaderboard: query by dayId only (single equality), then filter mode/category in JS
  // - Practice leaderboard: query by mode only, then filter category in JS
  // - Fallback: query by seasonId only if provided, otherwise by mode, otherwise grab recent.
  const clauses = [collection(db, 'scores')];

  if ((mode === 'daily' || !mode) && dayId) {
    clauses.push(where('dayId', '==', dayId));
  } else if (mode === 'practice') {
    clauses.push(where('mode', '==', 'practice'));
  } else if (seasonId) {
    clauses.push(where('seasonId', '==', seasonId));
  } else if (mode) {
    clauses.push(where('mode', '==', mode));
  }

  clauses.push(qLimit(200)); // fetch more than needed, then sort/slice client-side

  const q = query(...clauses);

  return onSnapshot(q, (snap) => {
    let scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side filters
    if (mode) scores = scores.filter(s => (s.mode || '').toLowerCase() === mode);
    if (dayId) scores = scores.filter(s => s.dayId === dayId);
    if (seasonId) scores = scores.filter(s => s.seasonId === seasonId);

    if (category && category !== '__ALL__') {
      scores = scores.filter(s => s.category === category);
    }

    // Client-side sort: score desc, correct desc, ms asc (fastest)
    scores.sort((a, b) => {
      const sa = Number(a.score) || 0;
      const sb = Number(b.score) || 0;
      if (sb !== sa) return sb - sa;

      const ca = Number(a.correct) || 0;
      const cb = Number(b.correct) || 0;
      if (cb !== ca) return cb - ca;

      const ma = Number(a.ms) || Number(a.time) || 0;
      const mb = Number(b.ms) || Number(b.time) || 0;
      return ma - mb;
    });

    onData(scores.slice(0, safeLimit));
  }, onError);
}




export async function getScoreDoc(docId){
  if(!docId) return null;
  const snap = await getDoc(doc(db,'scores',String(docId)));
  return snap.exists() ? ({ id: snap.id, ...snap.data() }) : null;
}

export async function fetchLeaderboardOnce({ category, limit, seasonId, dayId, mode }){
  const clauses = [collection(db,'scores')];
  if (mode) clauses.push(where('mode','==',mode));
  if (seasonId) clauses.push(where('seasonId','==',seasonId));
  if (dayId) clauses.push(where('dayId','==',dayId));
  if (category && category !== '__ALL__') clauses.push(where('category','==',category));
  clauses.push(orderBy('score','desc'));
  clauses.push(orderBy('correct','desc'));
  clauses.push(orderBy('ms','asc'));
  clauses.push(qLimit(limit||50));
  const q = query(...clauses);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
