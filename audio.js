// audio.js — Bible Battle audio manager (Safari-safe-ish, placeholder assets)
//
// Usage:
//   import { initAudioUI, unlockAudio, startMusic, stopMusic, sfx } from './audio.js';
//
// Placeholder files expected:
//   assets/music/bg-loop.wav
//   assets/sfx/click.wav
//   assets/sfx/correct.wav
//   assets/sfx/wrong.wav
//   assets/sfx/finish.wav

const LS_MUSIC = 'bb_musicVol';
const LS_SFX = 'bb_sfxVol';
const LS_MUTED = 'bb_muted';

let musicVol = clamp01(parseFloat(localStorage.getItem(LS_MUSIC) ?? '0.18'));
let sfxVol = clamp01(parseFloat(localStorage.getItem(LS_SFX) ?? '0.6'));
let muted = (localStorage.getItem(LS_MUTED) ?? '0') === '1';

let unlocked = false;
let ctx = null;

// Reuse any element pre-started by the inline boot script (play.html).
// That script runs during HTML parsing — before modules — and may already
// have music playing. Sharing the element avoids a double-audio glitch.
const bg = (window.__bbBg instanceof Audio) ? window.__bbBg : new Audio('assets/music/bg-loop.wav');
bg.loop = true;
if (!(window.__bbBg instanceof Audio)) bg.preload = 'auto';
window.__bbBg = bg; // always expose so other scripts can reach it

// Small pools so rapid clicks don't cut off.
const POOL_SIZE = 4;
const sfxPool = {
  click: makePool('assets/sfx/click.wav'),
  correct: makePool('assets/sfx/correct.wav'),
  wrong: makePool('assets/sfx/wrong.wav'),
  finish: makePool('assets/sfx/finish.wav'),
};

function makePool(src) {
  const arr = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(src);
    a.preload = 'auto';
    arr.push(a);
  }
  let idx = 0;
  return {
    play(vol) {
      const a = arr[idx];
      idx = (idx + 1) % arr.length;
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
      a.volume = muted ? 0 : clamp01(vol);
      // play() must be inside a user gesture until unlocked.
      return a.play();
    }
  };
}

function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function persist() {
  localStorage.setItem(LS_MUSIC, String(musicVol));
  localStorage.setItem(LS_SFX, String(sfxVol));
  localStorage.setItem(LS_MUTED, muted ? '1' : '0');
}

function applyVolumes() {
  bg.volume = muted ? 0 : musicVol;
}

export async function unlockAudio() {
  if (unlocked) return true;

  // Create/resume AudioContext (helps Safari “first play” issues).
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    // Play a tiny silent buffer to “prime” audio.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    // Even if this fails, HTMLAudio might still work.
    console.warn('AudioContext unlock failed:', e);
  }

  unlocked = true;
  applyVolumes();
  return true;
}

export function setMusicVolume(v) {
  musicVol = clamp01(v);
  applyVolumes();
  persist();
}

export function setSfxVolume(v) {
  sfxVol = clamp01(v);
  persist();
}

export function setMuted(v) {
  muted = !!v;
  applyVolumes();
  persist();
}

export function getAudioSettings() {
  return { musicVol, sfxVol, muted };
}

export function getMusicTime() {
  try { return bg.currentTime; } catch(e) { return 0; }
}

export async function startMusic() {
  applyVolumes();
  if (muted) return;
  if (!bg.paused) return; // already playing (boot script succeeded) — don't interrupt
  try {
    await bg.play();
  } catch (e) {
    // Usually means not unlocked yet. That's okay — click fallback handles it.
    console.warn('Music play blocked (needs user gesture):', e);
  }
}

export function stopMusic() {
  try { bg.pause(); } catch (_) {}
}

export const sfx = {
  click() { return sfxPool.click.play(sfxVol * 0.6); },
  correct() { return sfxPool.correct.play(sfxVol); },
  wrong() { return sfxPool.wrong.play(sfxVol); },
  finish() { return sfxPool.finish.play(sfxVol); },
};

// ---------- Settings UI ----------
export function initAudioUI() {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const close = document.getElementById('settingsClose');
  const overlay = document.getElementById('settingsOverlay');

  const music = document.getElementById('musicVol');
  const sfxSlider = document.getElementById('sfxVol');
  const mute = document.getElementById('muteToggle');
  const musicVal = document.getElementById('musicVal');
  const sfxVal = document.getElementById('sfxVal');

  const st = getAudioSettings();

  if (music) music.value = String(Math.round(st.musicVol * 100));
  if (sfxSlider) sfxSlider.value = String(Math.round(st.sfxVol * 100));
  if (mute) mute.checked = st.muted;

  const renderVals = () => {
    if (musicVal && music) musicVal.textContent = music.value + '%';
    if (sfxVal && sfxSlider) sfxVal.textContent = sfxSlider.value + '%';
  };
  renderVals();

  const open = async () => {
    if (!modal) return;
    modal.classList.add('open');
    if (overlay) overlay.classList.add('open');
    // Unlock on first intentional open.
    await unlockAudio();
    // Light click for feedback.
    try { await sfx.click(); } catch (_) {}
  };

  const hide = async () => {
    if (!modal) return;
    modal.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    try { await sfx.click(); } catch (_) {}
  };

  if (btn) btn.addEventListener('click', open);
  if (close) close.addEventListener('click', hide);
  if (overlay) overlay.addEventListener('click', hide);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  if (music) music.addEventListener('input', (e) => {
    const v = clamp01(parseFloat(e.target.value) / 100);
    setMusicVolume(v);
    renderVals();
  });

  if (sfxSlider) sfxSlider.addEventListener('input', (e) => {
    const v = clamp01(parseFloat(e.target.value) / 100);
    setSfxVolume(v);
    renderVals();
  });

  if (mute) mute.addEventListener('change', (e) => {
    setMuted(!!e.target.checked);
  });

  // Optional: when unmuting, try to start music if page chooses to run it.
}
