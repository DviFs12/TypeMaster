/* ═══════════════════════════════════════════
   ui.js — Camada de interface
   Toda manipulação de DOM passa por aqui
═══════════════════════════════════════════ */

/* ── Char-to-DOM-ID mapping ── */
const CHAR_MAP = {
  ';': 'semicolon',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  ' ': 'space'
};

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L',';'],
  ['Z','X','C','V','B','N','M',',','.','/']
];

let toastTimer = null;

/* ─────────────────────────────────────────
   TEXT RENDERING
───────────────────────────────────────── */

/**
 * Render a phrase into a container, coloring each character.
 * @param {string} containerId
 * @param {string} phrase
 * @param {string} typed
 * @param {number} ghostPos - index for ghost cursor (-1 to disable)
 */
export function renderPhrase(containerId, phrase, typed, ghostPos = -1) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < phrase.length; i++) {
    const span = document.createElement('span');
    span.className = 'ch';

    if (i < typed.length) {
      span.classList.add(typed[i] === phrase[i] ? 'correct' : 'incorrect');
    } else if (i === typed.length) {
      span.classList.add('current');
    }

    if (ghostPos >= 0 && i === ghostPos && i !== typed.length) {
      span.classList.add('ghost');
    }

    span.textContent = phrase[i] === ' ' ? '\u00A0' : phrase[i];
    frag.appendChild(span);
  }

  el.innerHTML = '';
  el.appendChild(frag);
}

/* ─────────────────────────────────────────
   METRICS
───────────────────────────────────────── */

export function setMetrics({ wpm, acc, elapsed, chars }) {
  setText('m-wpm',   wpm);
  setText('m-acc',   acc + '%');
  setText('m-time',  elapsed + 's');
  setText('m-chars', chars);
}

export function resetMetrics() {
  setMetrics({ wpm: 0, acc: 100, elapsed: 0, chars: 0 });
  unfreezeMetrics();
  setProgress('practice-progress', 0, false);
}

export function freezeMetrics() {
  ['m-wpm','m-acc','m-time','m-chars'].forEach(id => {
    document.getElementById(id)?.classList.add('frozen');
  });
}

export function unfreezeMetrics() {
  ['m-wpm','m-acc','m-time','m-chars'].forEach(id => {
    document.getElementById(id)?.classList.remove('frozen');
  });
}

export function setGhostMetric(text) {
  const el = document.getElementById('m-ghost-wpm');
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/* ─────────────────────────────────────────
   PROGRESS BAR
───────────────────────────────────────── */

export function setProgress(id, pct, complete = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(100, Math.max(0, pct)) + '%';
  el.classList.toggle('complete', complete);
}

/* ─────────────────────────────────────────
   KEYBOARD
───────────────────────────────────────── */

/**
 * Build a virtual keyboard into a container.
 * @param {string} containerId
 * @param {string} keyIdPrefix - prefix for key IDs (e.g. 'kp-', 'ak-', '')
 */
export function buildKeyboard(containerId, keyIdPrefix = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  KB_ROWS.forEach((row, ri) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';

    if (ri === 1) rowEl.appendChild(makeKey('Caps',  'wider util'));
    if (ri === 2) rowEl.appendChild(makeKey('Shift', 'wider util'));

    row.forEach(k => {
      const rawChar = k.toLowerCase();
      const char    = CHAR_MAP[rawChar] ?? rawChar;
      const keyEl   = makeKey(k, '');
      keyEl.dataset.char = rawChar;
      if (keyIdPrefix) keyEl.id = keyIdPrefix + (CHAR_MAP[rawChar] || rawChar);
      rowEl.appendChild(keyEl);
    });

    if (ri === 0) rowEl.appendChild(makeKey('⌫',     'wider util'));
    if (ri === 1) rowEl.appendChild(makeKey('↵',     'wide util'));
    if (ri === 2) rowEl.appendChild(makeKey('⇧',     'wider util'));

    container.appendChild(rowEl);
  });

  const spaceRow = document.createElement('div');
  spaceRow.className = 'kb-row';
  const spaceKey = makeKey('Espaço', 'space');
  spaceKey.dataset.char = ' ';
  if (keyIdPrefix) spaceKey.id = keyIdPrefix + 'space';
  spaceRow.appendChild(spaceKey);
  container.appendChild(spaceRow);
}

function makeKey(label, extraClass) {
  const el = document.createElement('div');
  el.className = 'key' + (extraClass ? ' ' + extraClass : '');
  el.textContent = label;
  return el;
}

/** Flash a key element with hit or error animation */
export function flashKey(keyIdPrefix, char, type) {
  const mapped = CHAR_MAP[char] ?? char.toLowerCase();
  const id     = keyIdPrefix + mapped;
  const el     = document.getElementById(id);
  if (!el) return;

  const cls = type === 'hit' ? 'flash-hit' : 'flash-err';
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 260);
}

/**
 * Apply heatmap coloring to keyboard keys.
 * Formula: errors / (hits + errors)  — as specified
 * @param {string} keyIdPrefix
 * @param {object} keyboardData - { char: { hits, errors } }
 */
export function applyHeatmap(keyIdPrefix, keyboardData) {
  document.querySelectorAll('.key[data-char]').forEach(el => {
    el.classList.remove('heat-low', 'heat-mid', 'heat-high');
    const char = el.dataset.char;
    if (!char || !keyIdPrefix) return;  // analysis keyboard has no prefix, handle separately

    const stat  = keyboardData[char];
    const total = stat ? stat.hits + stat.errors : 0;
    if (!stat || total < 5) return;

    // Corrected formula: errors / (hits + errors)
    const rate = stat.errors / total;
    if      (rate >= 0.30) el.classList.add('heat-high');
    else if (rate >= 0.10) el.classList.add('heat-mid');
    else                   el.classList.add('heat-low');
  });
}

/** Apply heatmap to a specific container (analysis page) */
export function applyHeatmapToContainer(containerId, keyboardData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.key[data-char]').forEach(el => {
    el.classList.remove('heat-low', 'heat-mid', 'heat-high');
    const char  = el.dataset.char;
    const stat  = keyboardData[char];
    const total = stat ? stat.hits + stat.errors : 0;
    if (!stat || total < 5) return;
    const rate = stat.errors / total;
    if      (rate >= 0.30) el.classList.add('heat-high');
    else if (rate >= 0.10) el.classList.add('heat-mid');
    else                   el.classList.add('heat-low');
  });
}

/* ─────────────────────────────────────────
   TRAINING KEYBOARD HELPERS
───────────────────────────────────────── */

export function applyLessonHighlight(containerId, lessons, lessonIdx) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.key[data-char]').forEach(el => {
    el.classList.remove('target', 'learned');
  });

  for (let i = 0; i < lessonIdx; i++) {
    lessons[i].chars.split('').forEach(c => {
      container.querySelector(`[data-char="${c}"]`)?.classList.add('learned');
    });
  }
  lessons[lessonIdx].chars.split('').forEach(c => {
    container.querySelector(`[data-char="${c}"]`)?.classList.add('target');
  });
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */

export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ─────────────────────────────────────────
   UTILITIES
───────────────────────────────────────── */

export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export function toggleClass(id, cls, force) {
  document.getElementById(id)?.classList.toggle(cls, force);
}

export function showEl(id)  { document.getElementById(id)?.classList.remove('hidden'); }
export function hideEl(id)  { document.getElementById(id)?.classList.add('hidden');    }

/** Show or hide results panel */
export function showResults(show) {
  const el = document.getElementById('results-panel');
  if (el) el.classList.toggle('hidden', !show);
}

/** Set consistency label and color */
export function setConsistencyBadge(score) {
  const el = document.getElementById('m-consistency');
  if (!el) return;
  let label, cls;
  if      (score >= 75) { label = 'Alta ⚡';  cls = 'cons-high'; }
  else if (score >= 45) { label = 'Média 〜'; cls = 'cons-mid';  }
  else                  { label = 'Baixa ⚠';  cls = 'cons-low';  }
  el.textContent = label;
  el.className   = 'consistency-badge ' + cls;
}

export { KB_ROWS, CHAR_MAP };
