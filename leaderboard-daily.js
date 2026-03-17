import { initAudioUI } from './audio.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const viewEl    = document.getElementById('view');
const limitEl   = document.getElementById('limit');
const rowsEl    = document.getElementById('rows');
const statusEl  = document.getElementById('status');
const labelEl   = document.getElementById('seasonLabel');

// Winner banners
const kidsWeeklyWinnerEl = document.getElementById('kidsWeeklyWinner');
const kidsWeeklyRangeEl  = document.getElementById('kidsWeeklyRange');
const adultsLastWinnerEl = document.getElementById('adultsLastWinner');
const adultsLastRangeEl  = document.getElementById('adultsLastRange');

// Age group tabs
const tabAll    = document.getElementById('tabAll');
const tabKids   = document.getElementById('tabKids');
const tabAdults = document.getElementById('tabAdults');

let activeTab = 'all'; // 'all' | 'kid' | 'adult'
let rawDaily  = [];

// ── Date helpers ──────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function dayIdFor(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayId(dayId) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(dayId || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function weekStartSunday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function scoreLocalDate(s) {
  if (s?.dayId) { const d = parseDayId(s.dayId); if (d) return d; }
  const v = s?.createdAt || s?.date;
  if (v?.toDate) return v.toDate();
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val) {
  if (!val) return '';
  if (typeof val?.toDate === 'function') return val.toDate().toLocaleDateString();
  const d = (val instanceof Date) ? val : new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

// ── Sorting ───────────────────────────────────────────────────
function sortScores(arr) {
  return arr.slice().sort((a, b) => {
    const sd = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (sd !== 0) return sd;
    const cd = (Number(b.correct) || 0) - (Number(a.correct) || 0);
    if (cd !== 0) return cd;
    return (Number(a.ms) || Number(a.time) || 0) - (Number(b.ms) || Number(b.time) || 0);
  });
}

// ── Age-group filter ──────────────────────────────────────────
// Scores without an ageGroup field are treated as 'adult' for legacy compatibility
function filterByTab(scores, tab) {
  if (tab === 'all')   return scores;
  if (tab === 'kid')   return scores.filter(s => s.ageGroup === 'kid');
  if (tab === 'adult') return scores.filter(s => s.ageGroup === 'adult' || !s.ageGroup);
  return scores;
}

// ── Render table ──────────────────────────────────────────────
function render(scores, limit) {
  rowsEl.innerHTML = '';
  const list = sortScores(scores).slice(0, limit);

  if (list.length === 0) {
    statusEl.textContent = 'No scores yet.';
    return;
  }
  statusEl.textContent = '';

  const frag = document.createDocumentFragment();
  list.forEach((s, i) => {
    const tr = document.createElement('tr');

    const rank = document.createElement('td');
    rank.textContent = String(i + 1);

    const name = document.createElement('td');
    const displayName = s.playerName || s.name || 'Anonymous';
    // On the "All" tab, add a small emoji badge so the group is visible at a glance
    if (activeTab === 'all' && s.ageGroup) {
      const badge = document.createElement('span');
      badge.className = `agePill agePill--${s.ageGroup}`;
      badge.textContent = s.ageGroup === 'kid' ? ' 👦' : ' 👨';
      name.textContent = displayName;
      name.appendChild(badge);
    } else {
      name.textContent = displayName;
    }

    const score = document.createElement('td');
    score.className = 'num';
    score.textContent = String(Number(s.score) || 0);

    const correct = document.createElement('td');
    correct.className = 'num';
    correct.textContent = String(Number(s.correct) || 0);

    const date = document.createElement('td');
    date.textContent = fmtDate(s.createdAt || s.date);

    tr.append(rank, name, score, correct, date);
    frag.appendChild(tr);
  });
  rowsEl.appendChild(frag);
}

// ── Winner banners ────────────────────────────────────────────
function updateWinnerBanners() {
  const now           = new Date();
  const thisWeekStart = weekStartSunday(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd   = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const fmt = (d) => d.toLocaleDateString();

  // Kids — current week leader (prize is awarded at end of the week)
  const kidsThisWeek = rawDaily.filter(s => {
    if (s.ageGroup !== 'kid') return false;
    const d = scoreLocalDate(s);
    return d && d >= thisWeekStart && d < nextWeekStart;
  });
  const kidsTop = sortScores(kidsThisWeek)[0];
  if (kidsWeeklyWinnerEl) {
    kidsWeeklyWinnerEl.textContent = kidsTop
      ? `${kidsTop.playerName || kidsTop.name || 'Anonymous'} — ${Number(kidsTop.score) || 0} pts (${Number(kidsTop.correct) || 0} correct)`
      : 'No kids scores yet this week';
  }
  if (kidsWeeklyRangeEl) kidsWeeklyRangeEl.textContent = `${fmt(thisWeekStart)} – ${fmt(lastWeekEnd < thisWeekStart ? thisWeekStart : now)}`;

  // Adults — last week's top player
  const adultsLastWeek = rawDaily.filter(s => {
    if (s.ageGroup === 'kid') return false; // exclude kids
    const d = scoreLocalDate(s);
    return d && d >= lastWeekStart && d < thisWeekStart;
  });
  const adultsTop = sortScores(adultsLastWeek)[0];
  if (adultsLastWinnerEl) {
    adultsLastWinnerEl.textContent = adultsTop
      ? `${adultsTop.playerName || adultsTop.name || 'Anonymous'} — ${Number(adultsTop.score) || 0} pts (${Number(adultsTop.correct) || 0} correct)`
      : '—';
  }
  if (adultsLastRangeEl) adultsLastRangeEl.textContent = `${fmt(lastWeekStart)} – ${fmt(lastWeekEnd)}`;
}

// ── Apply view / tab / limit ──────────────────────────────────
function applyView() {
  const now   = new Date();
  const limit = Number(limitEl.value) || 20;

  let baseScores;

  if (viewEl.value === 'today') {
    const todayId = dayIdFor(now);
    baseScores = rawDaily.filter(s => {
      if (s.dayId) return s.dayId === todayId;
      const d = scoreLocalDate(s);
      return d && dayIdFor(d) === todayId;
    });
    labelEl.textContent = `Today: ${todayId}`;
  } else {
    const start = weekStartSunday(now);
    const end   = new Date(start);
    end.setDate(end.getDate() + 7);
    baseScores = rawDaily.filter(s => {
      const d = scoreLocalDate(s);
      return d && d >= start && d < end;
    });
    labelEl.textContent = `Week of ${dayIdFor(start)}`;
  }

  render(filterByTab(baseScores, activeTab), limit);
}

// ── Tab switching ─────────────────────────────────────────────
function setTab(tab) {
  activeTab = tab;
  [tabAll, tabKids, tabAdults].forEach((btn, i) => {
    const t = ['all', 'kid', 'adult'][i];
    btn.classList.toggle('selected', tab === t);
    btn.setAttribute('aria-selected', String(tab === t));
  });
  applyView();
}

tabAll.addEventListener('click',    () => setTab('all'));
tabKids.addEventListener('click',   () => setTab('kid'));
tabAdults.addEventListener('click', () => setTab('adult'));

// ── Firebase subscription ─────────────────────────────────────
let unsub = null;

function resub() {
  if (typeof unsub === 'function') unsub();
  unsub = subscribeLeaderboard({
    mode: 'daily',
    category: '__ALL__',
    limit: 200,
    onData: (scores) => {
      rawDaily = scores || [];
      updateWinnerBanners();
      applyView();
    },
    onError: (e) => {
      console.error(e);
      statusEl.textContent = 'Leaderboard error. Check Firestore rules / indexes.';
    }
  });
}

viewEl.addEventListener('change', applyView);
limitEl.addEventListener('change', applyView);

resub();
