/* ═══════════════════════════════════════════
   settings.js — Configurações do usuário
   ─────────────────────────────────────────
   Inclui sistema COMPLETO de detecção de
   layout de teclado multicamadas:

   Camada 1 — event.code vs event.key
   Camada 2 — Sistema de confiança progressivo
   Camada 3 — Persistência em localStorage
   Camada 4 — Fallback manual obrigatório
═══════════════════════════════════════════ */

import * as UI    from './ui.js';
import * as Store from './storage.js';
import * as KBL   from './keyboard-layout.js';
import { AppData, emitSave } from './app.js';

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */

// Whether the user has explicitly chosen a layout (disables auto-override)
let userChoseLayout = false;

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */

export function init() {
  loadUI();
  initLayoutDetection();
  updateDetectionStatusUI();
}

function loadUI() {
  const s = AppData.settings;
  setChecked('toggle-theme',  !s.dark);
  setVal('font-size',          s.fontSize);
  setChecked('toggle-sound',   s.sound);
  setVal('difficulty',         s.difficulty);
  setVal('language',           s.language);
  setVal('kb-layout',          s.layout || 'qwerty');
  setVal('text-mode',          s.textMode || 'phrases');
  UI.setText('font-size-lbl',  s.fontSize + 'px');
}

/* ─────────────────────────────────────────
   APPLY — reads form → updates AppData
   (visual settings only, NOT layout)
───────────────────────────────────────── */

export function apply() {
  const s = AppData.settings;
  s.dark       = !getChecked('toggle-theme');
  s.fontSize   = parseInt(getVal('font-size'), 10);
  s.sound      = getChecked('toggle-sound');
  s.difficulty = getVal('difficulty');
  s.language   = getVal('language');
  s.textMode   = getVal('text-mode');

  document.documentElement.setAttribute('data-theme', s.dark ? 'dark' : 'light');
  document.documentElement.style.setProperty('--fs', s.fontSize + 'px');
  UI.setText('font-size-lbl', s.fontSize + 'px');
  emitSave();
}

/* ─────────────────────────────────────────
   LAYOUT — manual selection (Camada 4)
   Called by onchange on the <select>
───────────────────────────────────────── */

export function applyLayout() {
  const chosen = getVal('kb-layout');
  userChoseLayout = true;

  // Inform engine: user overrode auto-detection
  KBL.setManualOverride(chosen);
  commitLayout(chosen, 'manual');
  UI.setText('layout-detected', '✔ Definido manualmente');
}

/* ─────────────────────────────────────────
   LAYOUT DETECTION SYSTEM — MULTICAMADAS
───────────────────────────────────────── */

function initLayoutDetection() {
  // Subscribe to detection engine
  KBL.onLayoutDetected(onLayoutDetected);

  // Start passive keydown listener
  KBL.startDetection();

  // Camada 3: restore previously persisted layout
  restorePersistedLayout();
}

/**
 * Called by keyboard-layout.js when confidence threshold is met.
 * source: 'auto' | 'manual'
 */
function onLayoutDetected(layout, source) {
  // Camada 4: manual override takes priority
  if (userChoseLayout && source === 'auto') return;

  const prev = AppData.settings.layout;
  if (layout === prev && source === 'auto') return;

  commitLayout(layout, source);

  if (source === 'auto') {
    const name = KBL.LAYOUT_DEFS[layout]?.label ?? layout.toUpperCase();
    UI.toast(`⌨ Layout ${name} detectado automaticamente`, 'success');
    UI.setText('layout-detected', `🔍 Auto: ${name}`);
  }
}

/**
 * Persist and apply a confirmed layout everywhere.
 */
function commitLayout(layout, source) {
  AppData.settings.layout = layout;
  setVal('kb-layout', layout);

  // Rebuild all virtual keyboards dynamically
  rebuildAllKeyboards(layout);

  // Camada 3: persist to its own key for fast boot
  persistLayout(layout);
  emitSave();

  updateDetectionStatusUI(source);
}

/* ─────────────────────────────────────────
   KEYBOARD REBUILDING
   Rebuilds every visible keyboard when layout changes
───────────────────────────────────────── */

function rebuildAllKeyboards(layout) {
  if (document.getElementById('keyboard')) {
    UI.buildKeyboard('keyboard', 'kp-', layout);
  }
  if (document.getElementById('analysis-keyboard')) {
    UI.buildKeyboard('analysis-keyboard', '', layout);
    UI.applyHeatmapToContainer('analysis-keyboard', AppData.keyboard);
  }
}

/* ─────────────────────────────────────────
   CAMADA 3 — PERSISTENCE
───────────────────────────────────────── */

const LAYOUT_KEY = 'typemaster_keyboard_layout';

function persistLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, layout); } catch {}
}

function restorePersistedLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved && KBL.LAYOUT_DEFS[saved] && saved !== AppData.settings.layout) {
      AppData.settings.layout = saved;
      setVal('kb-layout', saved);
      emitSave();
    }
  } catch {}
}

/* ─────────────────────────────────────────
   STATUS UI
───────────────────────────────────────── */

function updateDetectionStatusUI(source) {
  const layout = AppData.settings.layout;
  const name   = KBL.LAYOUT_DEFS[layout]?.label ?? layout.toUpperCase();
  const conf   = KBL.getConfidence();

  let txt;
  if      (source === 'manual') txt = `✔ Manual: ${name}`;
  else if (source === 'auto')   txt = `🔍 Auto-detectado: ${name}`;
  else {
    txt = KBL.isManualOverride()
      ? `✔ Manual: ${name}`
      : `Layout: ${name} (auto-detectado ao digitar)`;
  }
  UI.setText('layout-detected', txt);

  // Optional confidence debug indicator
  const dbg = document.getElementById('layout-confidence');
  if (dbg) {
    dbg.textContent =
      `ABNT2: ${conf.abnt2}/${conf.threshold} · QWERTY: ${conf.qwerty}/${conf.threshold}`;
  }
}

/* ─────────────────────────────────────────
   DATA ACTIONS
───────────────────────────────────────── */

export function clearSessions() {
  if (!confirm('Apagar histórico de sessões e heatmap?')) return;
  Store.clearSessions(AppData);
  UI.toast('Histórico apagado ✓', 'success');
}

export function resetAll() {
  if (!confirm('Resetar TODOS os dados? (streak, heatmap, ranking, sessões)')) return;
  Store.resetAll(AppData);
  userChoseLayout = false;
  KBL.clearManualOverride();
  try { localStorage.removeItem(LAYOUT_KEY); } catch {}
  loadUI();
  UI.toast('Dados resetados ✓', 'success');
}

/* ─────────────────────────────────────────
   PWA INSTALL
───────────────────────────────────────── */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('pwa-install-btn')?.classList.remove('hidden');
});

export function installPWA() {
  if (!deferredPrompt) {
    UI.toast('App já instalado ou não disponível neste navegador', 'warning');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') UI.toast('TypeMaster instalado! ✓', 'success');
    deferredPrompt = null;
    document.getElementById('pwa-install-btn')?.classList.add('hidden');
  });
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }
function getChecked(id)      { return document.getElementById(id)?.checked ?? false; }
function setVal(id, val)     { const el = document.getElementById(id); if (el) el.value = val; }
function getVal(id)          { return document.getElementById(id)?.value ?? ''; }
