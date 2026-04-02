/* ═══════════════════════════════════════════
   storage.js — Persistência centralizada
   Único ponto de contato com localStorage
═══════════════════════════════════════════ */

const STORAGE_KEY = 'typemaster_data';

/** @returns {AppData} fresh default data shape */
function defaults() {
  return {
    stats: {
      bestWPM:      0,
      avgAccuracy:  0,
      sessions:     []   // { wpm, acc, elapsed, consistency, mode, date }
    },
    keyboard: {},        // char -> { hits: number, errors: number }
    streak: {
      current:  0,
      lastDate: null     // YYYY-MM-DD
    },
    ranking: {
      wpm:         [],   // top-10 { wpm, acc, date }
      accuracy:    [],   // top-10 { acc, wpm, date }
      consistency: [],   // top-10 { score, wpm, date }
      bestStreak:  0
    },
    settings: {
      dark:       true,
      fontSize:   16,
      sound:      false,
      difficulty: 'medium',
      language:   'pt',
      layout:     'qwerty',
      textMode:   'phrases'   // 'phrases' | 'code'
    },
    lessonProgress: [],
    lastGhost: null      // { phrase, timestamps[] }
  };
}

/** Deep-merge saved data onto defaults (handles missing keys after updates) */
function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      out[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/** Load data from localStorage */
export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return deepMerge(defaults(), JSON.parse(raw));
  } catch {
    return defaults();
  }
}

/** Persist entire data object */
export function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[Storage] Save failed:', e);
  }
}

/** Wipe all sessions, keyboard stats, ghost */
export function clearSessions(data) {
  data.stats.sessions    = [];
  data.stats.bestWPM     = 0;
  data.stats.avgAccuracy = 0;
  data.keyboard          = {};
  data.lastGhost         = null;
  save(data);
}

/** Full reset to defaults */
export function resetAll(data) {
  const d = defaults();
  Object.assign(data, d);
  save(data);
}

/**
 * Persist a completed session and update derived stats.
 * @param {object} data     - AppData
 * @param {object} session  - { wpm, acc, elapsed, consistency, mode, date }
 */
export function addSession(data, session) {
  data.stats.sessions.unshift(session);
  if (data.stats.sessions.length > 50) data.stats.sessions.pop();

  // Best WPM
  if (session.wpm > data.stats.bestWPM) data.stats.bestWPM = session.wpm;

  // Average accuracy
  const accs = data.stats.sessions.map(s => s.acc);
  data.stats.avgAccuracy = Math.round(accs.reduce((a, b) => a + b, 0) / accs.length);

  // Update rankings
  updateRanking(data, session);

  save(data);
}

function updateRanking(data, session) {
  const { ranking } = data;

  // WPM ranking
  ranking.wpm.push({ wpm: session.wpm, acc: session.acc, date: session.date });
  ranking.wpm.sort((a, b) => b.wpm - a.wpm);
  ranking.wpm = ranking.wpm.slice(0, 10);

  // Accuracy ranking
  ranking.accuracy.push({ acc: session.acc, wpm: session.wpm, date: session.date });
  ranking.accuracy.sort((a, b) => b.acc - a.acc);
  ranking.accuracy = ranking.accuracy.slice(0, 10);

  // Consistency ranking (lower variance = higher score; store as 0-100)
  if (session.consistency != null) {
    ranking.consistency.push({ score: session.consistency, wpm: session.wpm, date: session.date });
    ranking.consistency.sort((a, b) => b.score - a.score);
    ranking.consistency = ranking.consistency.slice(0, 10);
  }

  // Best streak
  if (data.streak.current > (ranking.bestStreak || 0)) {
    ranking.bestStreak = data.streak.current;
  }
}

/** Record a keypress result for heatmap */
export function recordKey(data, char, isHit) {
  const c = char.toLowerCase();
  if (!c || c.length > 1) return;
  if (!data.keyboard[c]) data.keyboard[c] = { hits: 0, errors: 0 };
  if (isHit) data.keyboard[c].hits++;
  else       data.keyboard[c].errors++;
}

/**
 * Check and update streak.
 * Uses YYYY-MM-DD format to avoid timezone/timestamp issues.
 * Guards against double-increment on same day.
 */
export function checkStreak(data) {
  const today = toDateStr(new Date());
  const { streak } = data;

  if (streak.lastDate === today) return;  // already counted today

  if (streak.lastDate) {
    const prev     = new Date(streak.lastDate + 'T00:00:00');
    const expected = toDateStr(new Date(prev.getTime() + 86400000));
    streak.current = (expected === today) ? streak.current + 1 : 1;
  } else {
    streak.current = 1;
  }

  streak.lastDate = today;
  save(data);
}

/** Format Date as YYYY-MM-DD */
export function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}
