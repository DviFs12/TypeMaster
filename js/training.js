/* ═══════════════════════════════════════════
   training.js — Modo de Treinamento Guiado
═══════════════════════════════════════════ */

import * as UI      from './ui.js';
import * as Storage from './storage.js';
import { AppData, emitSave } from './app.js';

/* ─────────────────────────────────────────
   LIÇÕES
───────────────────────────────────────── */

export const LESSONS = [
  { name: 'Linha Base',    desc: 'As 8 teclas centrais',     keys: 'A S D F J K L ;',   chars: 'asdfjkl;', sequence: 'asdf jkl asdf jkl fj fk fl dj dk dl sj sk aj ak fja dkl sal fad' },
  { name: 'E e I',         desc: 'Vogais E e I',              keys: 'E I',                chars: 'ei',       sequence: 'fie dei lie kie sei jei field like side disk isle life fire' },
  { name: 'G e H',         desc: 'Teclas centrais G e H',     keys: 'G H',                chars: 'gh',       sequence: 'gh hg had glad hash half head had high held help fish glad' },
  { name: 'T e Y',         desc: 'Fila superior T e Y',       keys: 'T Y',                chars: 'ty',       sequence: 'ty yt fit jet get yet stay they type year tied data trade' },
  { name: 'R e U',         desc: 'Fila superior R e U',       keys: 'R U',                chars: 'ru',       sequence: 'ru ur rut run use fur rule true jury sure hurt turn rise' },
  { name: 'W e O',         desc: 'Fila superior W e O',       keys: 'W O',                chars: 'wo',       sequence: 'wo ow word know flow glow work grow wolf wood follow worth' },
  { name: 'Q e P',         desc: 'Cantos superiores Q e P',   keys: 'Q P',                chars: 'qp',       sequence: 'qp quite place quick poem port pulp quip kept type prop' },
  { name: 'Z X C V',       desc: 'Fila inferior esquerda',    keys: 'Z X C V',            chars: 'zxcv',     sequence: 'zap cap vex zero cave text flex vice exact civil excel' },
  { name: 'B N M',         desc: 'Fila inferior direita',     keys: 'B N M',              chars: 'bnm',      sequence: 'bn nm man bin van name bone moon mind number member' },
  { name: 'Pontuação',     desc: 'Vírgula, ponto e barra',    keys: ', . /',              chars: ',./  ',    sequence: 'one, two. three, four. end. yes, no. a, b, c. first, last.' }
];

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */

const state = {
  lessonIdx:  0,
  phrase:     '',
  typedText:  '',
  correct:    0,
  total:      0
};

const KEY_PREFIX = 'kp-';

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */

export function init() {
  UI.buildKeyboard('keyboard', KEY_PREFIX);
  loadLesson();
}

/* ─────────────────────────────────────────
   LESSON MANAGEMENT
───────────────────────────────────────── */

function loadLesson() {
  const lesson = LESSONS[state.lessonIdx];

  UI.setText('lesson-name', `Lição ${state.lessonIdx + 1} — ${lesson.name}`);
  UI.setText('lesson-desc', lesson.desc);
  UI.setText('lesson-keys', lesson.keys);

  renderProgressDots();
  updateNavButtons();

  state.phrase    = generatePhrase(lesson);
  state.typedText = '';
  state.correct   = 0;
  state.total     = 0;

  UI.applyLessonHighlight('keyboard', LESSONS, state.lessonIdx);
  UI.renderPhrase('train-display', state.phrase, '');
  UI.setProgress('train-progress', 0, false);
  UI.setText('train-score', '');

  const input = document.getElementById('train-input');
  if (input) { input.value = ''; input.focus(); }
}

function generatePhrase(lesson) {
  const words = lesson.sequence.split(' ').filter(Boolean);
  const chosen = [];
  for (let i = 0; i < 9; i++) {
    chosen.push(words[Math.floor(Math.random() * words.length)]);
  }
  return chosen.join(' ');
}

function renderProgressDots() {
  const prog = document.getElementById('lesson-progress');
  if (!prog) return;
  prog.innerHTML = LESSONS.map((_, i) => {
    let cls = 'l-dot';
    if (AppData.lessonProgress.includes(i)) cls += ' done';
    if (i === state.lessonIdx) cls += ' current';
    return `<div class="${cls}"></div>`;
  }).join('');
}

function updateNavButtons() {
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  if (prevBtn) prevBtn.disabled = state.lessonIdx === 0;
  if (nextBtn) nextBtn.disabled = state.lessonIdx === LESSONS.length - 1;
}

/* ─────────────────────────────────────────
   INPUT HANDLER
───────────────────────────────────────── */

export function handleInput(e) {
  const val    = e.target.value;
  const phrase = state.phrase;

  if (val.length > state.typedText.length) {
    const idx      = val.length - 1;
    const pressed  = val[idx];
    const expected = phrase[idx];

    if (pressed != null && expected != null) {
      state.total++;
      const isHit = pressed === expected;
      if (isHit) state.correct++;

      UI.flashKey(KEY_PREFIX, expected, isHit ? 'hit' : 'err');
      playSound(isHit ? 'hit' : 'error');
    }
  }

  state.typedText = val.slice(0, phrase.length);
  if (val.length > phrase.length) e.target.value = state.typedText;

  UI.renderPhrase('train-display', phrase, state.typedText);
  UI.setProgress('train-progress',
    (state.typedText.length / phrase.length) * 100,
    state.typedText.length >= phrase.length
  );

  if (state.typedText.length >= phrase.length) {
    onLessonComplete();
  }
}

function onLessonComplete() {
  const acc = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 100;
  UI.setText('train-score', `✓ ${acc}% precisão`);

  // Mark lesson as completed
  if (!AppData.lessonProgress.includes(state.lessonIdx)) {
    AppData.lessonProgress.push(state.lessonIdx);
    emitSave();
  }

  if (acc >= 80) {
    if (state.lessonIdx < LESSONS.length - 1) {
      UI.toast(`Lição concluída com ${acc}%! Avançando...`, 'success');
      setTimeout(() => { state.lessonIdx++; loadLesson(); }, 1700);
    } else {
      UI.toast('🏆 Todas as lições concluídas!', 'success');
    }
  } else {
    UI.toast(`${acc}% de precisão — Precisa de 80%. Tente novamente!`, 'warning');
  }
}

/* ─────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────── */

export function restart()    { loadLesson(); }
export function focusInput() { document.getElementById('train-input')?.focus(); }

export function prev() {
  if (state.lessonIdx > 0) { state.lessonIdx--; loadLesson(); }
}

export function next() {
  if (state.lessonIdx < LESSONS.length - 1) { state.lessonIdx++; loadLesson(); }
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

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
    } else {
      osc.type = 'sawtooth'; osc.frequency.value = 160;
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    }
    osc.start(); osc.stop(ctx.currentTime + 0.2);
  } catch {}
}
