/* ═══════════════════════════════════════════
   practice.js — Modo de Prática
   ─────────────────────────────────────────
   BUG FIXES implementados:
   • isFinished flag para cronômetro
   • endTime frozen para cálculo de WPM
   • isComplete() valida char-a-char
   • Ghost timestamps normalizados
   • Consistência (variância entre keypresses)
═══════════════════════════════════════════ */

import * as UI      from './ui.js';
import * as Storage from './storage.js';
import { AppData, emitSave } from './app.js';

/* ─────────────────────────────────────────
   ESTADO CENTRALIZADO
───────────────────────────────────────── */
export const state = {
  currentText:     '',
  typedText:       '',
  startTime:       null,
  endTime:         null,       // frozen when finished
  errors:          0,
  totalTyped:      0,
  isFinished:      false,      // CRITICAL FLAG
  timerInterval:   null,
  ghostInterval:   null,
  mode:            'normal',   // 'normal' | 'problem' | 'competitive'
  keyIntervals:    [],         // ms between consecutive correct keypresses (for consistency)
  lastCorrectTime: null,
  ghostTimestamps: [],         // ms from startTime per correct char (raw)
  ghostPosition:   -1
};

let phrases     = [];          // loaded from JSON
let codePhrases = [];

const KEY_PREFIX = 'kp-';

/* ─────────────────────────────────────────
   INIT & PHRASE LOADING
───────────────────────────────────────── */

export async function init() {
  await loadPhrases();
  resetSession();
  syncModeButtons();
  UI.setGhostMetric(null);

  if (state.mode === 'competitive' && AppData.lastGhost) {
    UI.setGhostMetric('👻 —');
  }

  document.getElementById('typing-input')?.focus();
}

async function loadPhrases() {
  if (phrases.length && codePhrases.length) return;
  try {
    const [fr, cd] = await Promise.all([
      fetch('./data/frases.json').then(r => r.json()),
      fetch('./data/code.json').then(r => r.json())
    ]);
    phrases     = fr;
    codePhrases = cd;
  } catch (e) {
    console.warn('[Practice] Failed to load phrases, using fallback');
    phrases     = { pt: { easy:[], medium:[], hard:[] }, en: { easy:[], medium:[], hard:[] } };
    codePhrases = ['const x = 1;'];
  }
}

function getPhrasePool() {
  const { textMode, language, difficulty } = AppData.settings;
  if (textMode === 'code') return codePhrases;
  return phrases[language]?.[difficulty] ?? phrases.pt.medium;
}

function pickPhrase(exclude) {
  if (state.mode === 'problem') {
    return generateProblemPhrase() ?? pickRandom(getPhrasePool(), exclude);
  }
  if (state.mode === 'competitive' && AppData.lastGhost?.phrase) {
    return AppData.lastGhost.phrase;
  }
  return pickRandom(getPhrasePool(), exclude);
}

function pickRandom(pool, exclude) {
  if (!pool.length) return 'the quick brown fox jumps over the lazy dog';
  let p;
  let tries = 0;
  do { p = pool[Math.floor(Math.random() * pool.length)]; tries++; }
  while (p === exclude && pool.length > 1 && tries < 20);
  return p;
}

function generateProblemPhrase() {
  const keys = getProblemKeys(5).filter(k => /^[a-z]$/.test(k));
  if (keys.length < 2) return null;
  const words = [];
  for (let i = 0; i < 10; i++) {
    const len  = 2 + Math.floor(Math.random() * 4);
    let   word = '';
    for (let j = 0; j < len; j++) word += keys[Math.floor(Math.random() * keys.length)];
    words.push(word);
  }
  return words.join(' ');
}

function getProblemKeys(n) {
  return Object.entries(AppData.keyboard)
    .filter(([, v]) => (v.hits + v.errors) >= 5)
    .map(([k, v]) => ({ key: k, rate: v.errors / (v.hits + v.errors) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, n)
    .map(e => e.key);
}

/* ─────────────────────────────────────────
   SESSION RESET
───────────────────────────────────────── */

function resetSession() {
  // Stop any running intervals first
  clearTimers();

  Object.assign(state, {
    currentText:     pickPhrase(state.currentText),
    typedText:       '',
    startTime:       null,
    endTime:         null,
    errors:          0,
    totalTyped:      0,
    isFinished:      false,
    timerInterval:   null,
    ghostInterval:   null,
    keyIntervals:    [],
    lastCorrectTime: null,
    ghostTimestamps: [],
    ghostPosition:   -1
  });

  document.getElementById('typing-input').value = '';
  document.getElementById('results-panel').classList.add('hidden');
  UI.resetMetrics();
  UI.renderPhrase('phrase-display', state.currentText, '', -1);
  UI.setConsistencyBadge(0);
  UI.hideEl('results-panel');
}

function clearTimers() {
  clearInterval(state.timerInterval);
  clearInterval(state.ghostInterval);
}

/* ─────────────────────────────────────────
   INPUT HANDLER
───────────────────────────────────────── */

export function handleInput(e) {
  // CRITICAL: reject all input after finish
  if (state.isFinished) {
    e.target.value = state.typedText;
    return;
  }

  const val    = e.target.value;
  const phrase = state.currentText;

  // Start timer on first character
  if (!state.startTime && val.length > 0) {
    state.startTime = Date.now();
    Storage.checkStreak(AppData);
    startTimer();
    if (state.mode === 'competitive') startGhostPlayback();
  }

  // Track new character (only on additions)
  if (val.length > state.typedText.length) {
    const idx      = val.length - 1;
    const pressed  = val[idx];
    const expected = phrase[idx];

    if (pressed != null && expected != null) {
      state.totalTyped++;
      const isHit = pressed === expected;

      Storage.recordKey(AppData, expected, isHit);
      UI.flashKey(KEY_PREFIX, expected, isHit ? 'hit' : 'err');
      playSound(isHit ? 'hit' : 'error');

      if (isHit) {
        const now = Date.now();
        state.ghostTimestamps.push(now - state.startTime);
        if (state.lastCorrectTime != null) {
          state.keyIntervals.push(now - state.lastCorrectTime);
        }
        state.lastCorrectTime = now;
      } else {
        state.errors++;
      }
    }
  }

  // Clamp to phrase length
  const clamped = val.slice(0, phrase.length);
  if (val.length > phrase.length) e.target.value = clamped;
  state.typedText = clamped;

  UI.renderPhrase('phrase-display', phrase, clamped, state.ghostPosition);
  UI.setProgress('practice-progress', (clamped.length / phrase.length) * 100);

  // Check completion: validate every character individually
  if (isComplete()) finish();
}

/* ─────────────────────────────────────────
   COMPLETION CHECK (character-by-character)
───────────────────────────────────────── */

function isComplete() {
  const { currentText: phrase, typedText: typed } = state;
  if (typed.length !== phrase.length) return false;
  for (let i = 0; i < phrase.length; i++) {
    if (typed[i] !== phrase[i]) return false;
  }
  return true;
}

/* ─────────────────────────────────────────
   TIMER
───────────────────────────────────────── */

function startTimer() {
  state.timerInterval = setInterval(() => {
    if (state.isFinished) { clearInterval(state.timerInterval); return; }
    updateLiveMetrics();
  }, 150);
}

function updateLiveMetrics() {
  if (state.isFinished || !state.startTime) return;
  const elapsed = (Date.now() - state.startTime) / 1000;
  const minutes = elapsed / 60;
  const wpm     = minutes > 0 ? Math.round((state.typedText.length / 5) / minutes) : 0;
  const acc     = computeAccuracy();
  UI.setMetrics({ wpm, acc, elapsed: Math.round(elapsed), chars: state.typedText.length });
}

/* ─────────────────────────────────────────
   GHOST PLAYBACK (corrected: normalized timestamps)
───────────────────────────────────────── */

function startGhostPlayback() {
  const ghost = AppData.lastGhost;
  if (!ghost?.timestamps?.length) return;

  // Normalize timestamps: subtract first timestamp so they start from 0
  const normalized = ghost.timestamps.map(t => t - ghost.timestamps[0]);

  state.ghostInterval = setInterval(() => {
    if (state.isFinished) { clearInterval(state.ghostInterval); return; }

    const elapsed = Date.now() - state.startTime;
    let pos = 0;
    while (pos < normalized.length && normalized[pos] <= elapsed) pos++;
    state.ghostPosition = pos;

    UI.renderPhrase('phrase-display', state.currentText, state.typedText, pos);

    // Ghost WPM indicator
    const tIdx    = Math.min(pos, normalized.length - 1);
    const ghostMs = normalized[tIdx] || 0;
    const ghostWPM = ghostMs > 0 ? Math.round((pos / 5) / (ghostMs / 60000)) : 0;
    UI.setGhostMetric(`👻 ${ghostWPM} WPM`);
  }, 80);
}

/* ─────────────────────────────────────────
   FINISH (BUG-FREE)
───────────────────────────────────────── */

function finish() {
  // ① Freeze flag + stop intervals FIRST
  state.isFinished  = true;
  clearTimers();

  // ② Freeze endTime — used for ALL subsequent calculations
  if (!state.endTime) state.endTime = Date.now();

  // ③ Compute final metrics using frozen endTime
  const elapsed  = Math.round((state.endTime - state.startTime) / 1000);
  const minutes  = elapsed / 60;
  const wpm      = minutes > 0 ? Math.round((state.currentText.length / 5) / minutes) : 0;
  const acc      = computeAccuracy();
  const conScore = computeConsistency(state.keyIntervals);

  // ④ Freeze UI
  UI.setMetrics({ wpm, acc, elapsed, chars: state.currentText.length });
  UI.freezeMetrics();
  UI.setProgress('practice-progress', 100, true);
  UI.renderPhrase('phrase-display', state.currentText, state.typedText, -1);
  UI.setConsistencyBadge(conScore);
  playSound('done');

  // ⑤ Save ghost (normalize from 0)
  if (state.ghostTimestamps.length) {
    const base = state.ghostTimestamps[0];
    AppData.lastGhost = {
      phrase:     state.currentText,
      timestamps: state.ghostTimestamps.map(t => t - base)
    };
  }

  // ⑥ Save session
  const session = {
    wpm, acc,
    elapsed,
    consistency: conScore,
    mode: state.mode,
    date: new Date().toLocaleDateString('pt-BR')
  };
  Storage.addSession(AppData, session);
  emitSave();

  showResults(wpm, acc, elapsed, conScore);
}

/* ─────────────────────────────────────────
   METRICS CALCULATORS
───────────────────────────────────────── */

function computeAccuracy() {
  if (state.totalTyped === 0) return 100;
  return Math.round(((state.totalTyped - state.errors) / state.totalTyped) * 100);
}

/**
 * Compute consistency score 0–100 from inter-key intervals.
 * Higher variance → lower score.
 */
function computeConsistency(intervals) {
  if (intervals.length < 3) return 0;
  const variance = computeVariance(intervals);
  // Map variance to 0-100: lower variance = higher consistency
  // Empirical cap: 200000ms² variance ≈ very inconsistent
  const capped = Math.min(variance, 200000);
  return Math.round((1 - capped / 200000) * 100);
}

function computeVariance(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
}

/* ─────────────────────────────────────────
   RESULTS PANEL
───────────────────────────────────────── */

function showResults(wpm, acc, elapsed, conScore) {
  UI.setText('r-wpm',  wpm);
  UI.setText('r-acc',  acc + '%');
  UI.setText('r-time', elapsed + 's');

  // Consistency label
  let conLabel;
  if      (conScore >= 75) conLabel = `⚡ Alta (${conScore})`;
  else if (conScore >= 45) conLabel = `〜 Média (${conScore})`;
  else                     conLabel = `⚠ Baixa (${conScore})`;
  UI.setText('r-consistency', conLabel);

  // Comparison with previous session
  const sessions = AppData.stats.sessions;
  const prev     = sessions[1];
  const compEl   = document.getElementById('r-comparison');
  if (compEl) {
    if (prev) {
      const dWPM = wpm - prev.wpm;
      const dAcc = acc  - prev.acc;
      compEl.innerHTML =
        `<span class="${dWPM >= 0 ? 'pos' : 'neg'}">${dWPM >= 0 ? '+' : ''}${dWPM} WPM</span>` +
        `<span class="sep">·</span>` +
        `<span class="${dAcc >= 0 ? 'pos' : 'neg'}">${dAcc >= 0 ? '+' : ''}${dAcc}% prec.</span>` +
        `<span class="sep">vs anterior</span>`;
    } else {
      compEl.innerHTML = `<span class="pos">✨ Primeira sessão!</span>`;
    }
  }

  // Motivational message
  let msg;
  if      (wpm >= 80 && acc >= 97) msg = '🏆 Performance de elite!';
  else if (wpm >= 60 && acc >= 95) msg = '⭐ Nível profissional!';
  else if (wpm >= 40)              msg = '👍 Muito bom! Continue!';
  else if (wpm >= 20)              msg = '💪 Bom progresso!';
  else                             msg = '🌱 Continue praticando!';
  UI.setText('result-msg', msg);

  document.getElementById('results-panel')?.classList.remove('hidden');
}

/* ─────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────── */

export function setMode(mode) {
  state.mode = mode;
  syncModeButtons();
  init();
}

export function restart() {
  clearTimers();
  state.isFinished    = false;
  state.typedText     = '';
  state.startTime     = null;
  state.endTime       = null;
  state.errors        = 0;
  state.totalTyped    = 0;
  state.timerInterval = null;
  state.ghostInterval = null;
  state.keyIntervals  = [];
  state.lastCorrectTime = null;
  state.ghostTimestamps = [];
  state.ghostPosition = -1;

  document.getElementById('typing-input').value = '';
  document.getElementById('results-panel').classList.add('hidden');
  UI.resetMetrics();
  UI.renderPhrase('phrase-display', state.currentText, '', -1);
  document.getElementById('typing-input')?.focus();
}

export function nextPhrase() {
  resetSession();
  document.getElementById('typing-input')?.focus();
}

export function focusInput() {
  document.getElementById('typing-input')?.focus();
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function syncModeButtons() {
  ['normal','problem','competitive'].forEach(m => {
    document.getElementById('mode-' + m)?.classList.toggle('active', m === state.mode);
  });
}

function playSound(type) {
  if (!AppData.settings.sound) return;
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'hit') {
      osc.type = 'square'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'error') {
      osc.type = 'sawtooth'; osc.frequency.value = 160;
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'done') {
      osc.type = 'sine'; osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    }
  } catch {}
}
