/* ═══════════════════════════════════════════
   keyboard-layout.js
   ─────────────────────────────────────────
   Sistema de detecção multicamadas de layout
   de teclado (QWERTY / ABNT2).

   Limitação técnica: browsers NÃO expõem
   o layout diretamente. A detecção é feita via
   heurísticas de event.code vs event.key,
   sistema de confiança progressivo e fallback
   manual obrigatório.
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────
   LAYOUT DEFINITIONS
   Cada layout define:
     rows    — teclas visuais por linha
     charMap — char lógico → ID de elemento
     labels  — char lógico → rótulo exibido
───────────────────────────────────────── */

export const LAYOUT_DEFS = {
  qwerty: {
    id: 'qwerty',
    label: 'QWERTY (Internacional)',
    rows: [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L',';',"'"],
      ['Z','X','C','V','B','N','M',',','.', '/']
    ],
    // logical char → { display label, dom-id suffix }
    charMap: {
      'q':'q','w':'w','e':'e','r':'r','t':'t','y':'y','u':'u','i':'i','o':'o','p':'p',
      'a':'a','s':'s','d':'d','f':'f','g':'g','h':'h','j':'j','k':'k','l':'l',
      ';':'semicolon',"'":'quote',
      'z':'z','x':'x','c':'c','v':'v','b':'b','n':'n','m':'m',
      ',':'comma','.':'period','/':'slash',' ':'space'
    }
  },
  abnt2: {
    id: 'abnt2',
    label: 'ABNT2 (Português Brasil)',
    rows: [
      ['Q','W','E','R','T','Y','U','I','O','P','´','['],
      ['A','S','D','F','G','H','J','K','L','Ç','~',']'],
      ['Z','X','C','V','B','N','M',',','.', ';', '/']
    ],
    // ABNT2 key positions differ from QWERTY
    charMap: {
      'q':'q','w':'w','e':'e','r':'r','t':'t','y':'y','u':'u','i':'i','o':'o','p':'p',
      '´':'acute','[':'bracket-left',
      'a':'a','s':'s','d':'d','f':'f','g':'g','h':'h','j':'j','k':'k','l':'l',
      'ç':'cedilla','~':'tilde',']':'bracket-right',
      'z':'z','x':'x','c':'c','v':'v','b':'b','n':'n','m':'m',
      ',':'comma','.':'period',';':'semicolon','/':'slash',' ':'space'
    }
  }
};

/* ─────────────────────────────────────────
   CONFIDENCE-BASED DETECTION ENGINE
   ─────────────────────────────────────────
   Only confirms a layout after THRESHOLD
   consistent signals, preventing false-pos.
   Runs passively — never blocks input.
───────────────────────────────────────── */

const THRESHOLD = 3;          // signals needed to confirm
const DECAY_MS  = 30_000;     // reset confidence after inactivity

const confidence = {
  abnt2:  0,
  qwerty: 0,
  lastEventMs: 0
};

/** Callbacks registered by settings.js */
const onDetectCallbacks = [];

export function onLayoutDetected(cb) {
  onDetectCallbacks.push(cb);
}

function emit(layout, source) {
  onDetectCallbacks.forEach(cb => cb(layout, source));
}

/* ─────────────────────────────────────────
   SIGNAL EVALUATION
   Returns: 'abnt2' | 'qwerty' | null
   ─────────────────────────────────────────
   Strategy per event:
   1. Semicolon physical key:
      • key === 'ç' or 'Ç'          → strong ABNT2
      • key === ';' or ':'          → QWERTY evidence
        (but ';' can appear in ABNT2 on other row,
         so only count if no prior ABNT2 evidence)
   2. Quote physical key (BrowserKeyQ):
      • key === 'ã' or 'Ã'          → strong ABNT2
      • key === "'" or '"'          → QWERTY evidence
   3. BracketLeft:
      • key === '´' or '`' or '~'   → ABNT2 evidence
   4. BracketRight / Backslash:
      • key === ']' or '['          → ABNT2 row shift evidence
   5. Slash:
      • key === ';' in ABNT2 row    → ABNT2 evidence
   6. KeyZ through Slash row — watch for `;` in ABNT2 bottom row
───────────────────────────────────────── */

function evaluate(e) {
  const { code, key } = e;
  const lkey = key?.toLowerCase() ?? '';

  // Decay confidence after inactivity
  const now = Date.now();
  if (now - confidence.lastEventMs > DECAY_MS) {
    confidence.abnt2  = 0;
    confidence.qwerty = 0;
  }
  confidence.lastEventMs = now;

  /* ── ABNT2 signals ── */

  // Strongest: Semicolon key produces ç (ABNT2 hallmark)
  if (code === 'Semicolon' && (lkey === 'ç' || lkey === 'ç')) {
    confidence.abnt2 += 3;  // triple weight — definitive
  }

  // Quote key produces ã (ABNT2 hallmark)
  else if (code === 'Quote' && (lkey === 'ã' || lkey === 'ã')) {
    confidence.abnt2 += 3;
  }

  // BracketLeft produces acute / tilde / dead keys (ABNT2)
  else if (code === 'BracketLeft' && (lkey === '´' || lkey === '`' || lkey === '~' || lkey === 'dead_acute' || e.key === 'Dead')) {
    confidence.abnt2 += 2;
  }

  // BracketRight produces ] or [ — ABNT2 rows have extra keys
  else if (code === 'BracketRight' && (lkey === ']' || lkey === '[' || lkey === '}' || lkey === '{')) {
    confidence.abnt2 += 1;
  }

  // Backslash produces / (ABNT2 has extra key before right-shift)
  else if (code === 'Backslash' && lkey === '/') {
    confidence.abnt2 += 2;
  }

  // IntlRo (ABNT2-specific physical key between right-shift and Slash)
  else if (code === 'IntlRo') {
    confidence.abnt2 += 3;  // this key physically only exists on ABNT2
  }

  // IntlBackslash (also ABNT2-specific)
  else if (code === 'IntlBackslash') {
    confidence.abnt2 += 2;
  }

  /* ── QWERTY signals ── */

  // Semicolon key produces ; → QWERTY
  else if (code === 'Semicolon' && lkey === ';') {
    confidence.qwerty += 2;
  }

  // Quote key produces ' or " → QWERTY
  else if (code === 'Quote' && (lkey === "'" || lkey === '"')) {
    confidence.qwerty += 2;
  }

  // BracketLeft produces [ → QWERTY
  else if (code === 'BracketLeft' && (lkey === '[' || lkey === '{')) {
    confidence.qwerty += 1;
  }

  /* ── Check threshold ── */

  if (confidence.abnt2 >= THRESHOLD) {
    return 'abnt2';
  }
  if (confidence.qwerty >= THRESHOLD) {
    return 'qwerty';
  }

  return null;
}

/* ─────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────── */

let listenerAttached = false;
let manualOverride   = false;

/**
 * Start passive layout detection listener.
 * Safe to call multiple times — deduplicates.
 */
export function startDetection() {
  if (listenerAttached) return;
  listenerAttached = true;

  document.addEventListener('keydown', handleKeydown, { passive: true, capture: true });
}

export function stopDetection() {
  document.removeEventListener('keydown', handleKeydown, { capture: true });
  listenerAttached = false;
}

function handleKeydown(e) {
  if (manualOverride) return;

  const detected = evaluate(e);
  if (detected) {
    emit(detected, 'auto');
    // Don't stop listening — continue monitoring to handle
    // users switching OS input language mid-session
    confidence.abnt2  = 0;
    confidence.qwerty = 0;
  }
}

/**
 * User explicitly chose a layout. Disables auto-detection.
 */
export function setManualOverride(layout) {
  manualOverride = true;
  confidence.abnt2  = 0;
  confidence.qwerty = 0;
  emit(layout, 'manual');
}

/**
 * Re-enable auto-detection (user cleared manual override).
 */
export function clearManualOverride() {
  manualOverride = false;
}

export function isManualOverride() {
  return manualOverride;
}

/**
 * Get current confidence snapshot (for debug/display).
 */
export function getConfidence() {
  return { ...confidence, threshold: THRESHOLD };
}

/* ─────────────────────────────────────────
   KEY NORMALIZATION
   Given a raw pressed char and current layout,
   return the logical char used for scoring.
   ABNT2: maps 'ç' to ';' position for lessons,
   since lessons use ASCII sequences.
───────────────────────────────────────── */

const ABNT2_TO_ASCII = {
  'ç': ';',
  'Ç': ';',
  'ã': "'",
  'Ã': "'",
  'õ': ';',   // some combos
};

/**
 * Normalize a typed character given the active layout.
 * Returns the "expected" ASCII equivalent for scoring purposes
 * when layout is ABNT2 and a layout-specific char is typed.
 */
export function normalizeChar(char, layout) {
  if (layout !== 'abnt2') return char;
  return ABNT2_TO_ASCII[char] ?? char;
}
