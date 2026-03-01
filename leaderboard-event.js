import { initAudioUI } from './audio.js';
import { subscribeLeaderboard } from './scores.js';

initAudioUI();

const qs = new URLSearchParams(location.search);
const eventSlug = qs.get('event') || 'missions-2026';

const viewEl = document.getElementById('view');
const limitEl = document.getElementById('limit');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const rangeLabel = document.getElementById('rangeLabel');
const eventNameEl = document.getElementById('eventName');
const pageTitle = document.getElementById('pageTitle');

function pad2(n){ return String(n).padStart(2,'0'); }
function dayIdFor(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseDayId(dayId){
  const m=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(dayId||'')); 
  if(!m) return null;
  const d=new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
function weekStartSunday(d){
  const x=new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow=x.getDay(); // Sunday=0
  x.setDate(x.getDate()-dow);
  x.setHours(0,0,0,0);
  return x;
}
function scoreLocalDate(s){
  if(s?.dayId){ const d=parseDayId(s.dayId); if(d) return d; }
  const v=s?.createdAt || s?.date;
  if(v?.toDate && typeof v.toDate==='function') return v.toDate();
  const d=(v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(val){
  if(!val) return '';
  if(typeof val?.toDate==='function') return val.toDate().toLocaleDateString();
  const d=(val instanceof Date) ? val : new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}
function sortScores(scores){
  scores.sort((a,b)=>{
    const sa=Number(a.score)||0, sb=Number(b.score)||0;
    if(sb!==sa) return sb-sa;
    const ca=Number(a.correct)||0, cb=Number(b.correct)||0;
    if(cb!==ca) return cb-ca;
    const ma=Number(a.ms)||Number(a.time)||0, mb=Number(b.ms)||Number(b.time)||0;
    return ma-mb;
  });
  return scores;
}

let unsub=null;

function render(scores){
  rowsEl.innerHTML='';
  if(!scores || scores.length===0){ statusEl.textContent='No scores yet.'; return; }
  statusEl.textContent='';
  const frag=document.createDocumentFragment();
  scores.forEach((s,i)=>{
    const tr=document.createElement('tr');
    const tdRank=document.createElement('td'); tdRank.textContent=String(i+1);
    const tdName=document.createElement('td'); tdName.textContent=s.name || s.playerName || 'Anonymous';
    const tdScore=document.createElement('td'); tdScore.className='num'; tdScore.textContent=String(Number(s.score)||0);
    const tdCor=document.createElement('td'); tdCor.className='num'; tdCor.textContent=String(Number(s.correct)||0);
    const tdDate=document.createElement('td'); tdDate.textContent=fmtDate(s.createdAt || s.date);
    tr.append(tdRank, tdName, tdScore, tdCor, tdDate);
    frag.appendChild(tr);
  });
  rowsEl.appendChild(frag);
}

async function resub(){
  if(typeof unsub==='function') unsub();
  const now=new Date();
  const view=viewEl.value;
  const limit=Number(limitEl.value)||20;

  unsub = subscribeLeaderboard({
    mode: 'event',
    eventSlug,
    category: '__ALL__',
    limit: 200,
    onData: (scores)=>{
      let filtered = scores || [];
      if(view==='today'){
        const todayId = dayIdFor(now);
        filtered = filtered.filter(s=>{
          if(s.dayId) return s.dayId===todayId;
          const d=scoreLocalDate(s);
          return d && dayIdFor(d)===todayId;
        });
        rangeLabel.textContent = `Today: ${todayId}`;
      } else {
        const start=weekStartSunday(now);
        const end=new Date(start); end.setDate(end.getDate()+7);
        filtered = filtered.filter(s=>{
          const d=scoreLocalDate(s);
          return d && d>=start && d<end;
        });
        rangeLabel.textContent = `Week of ${dayIdFor(start)}`;
      }
      sortScores(filtered);
      render(filtered.slice(0, limit));
    },
    onError: (e)=>{
      console.error(e);
      statusEl.textContent='Leaderboard error. Check Firebase rules / indexes.';
    }
  });
}

viewEl.addEventListener('change', resub);
limitEl.addEventListener('change', resub);

// Optional: show slug nicely
const pretty = eventSlug.replace(/[-_]/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
if(eventNameEl) eventNameEl.textContent = pretty;
if(pageTitle) pageTitle.textContent = pretty + ' Leaderboard';

resub();
