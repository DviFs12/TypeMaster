/* ═══════════════════════════════════════════
   settings.js — Configurações do usuário
   Inclui detecção de layout de teclado
═══════════════════════════════════════════ */

import * as UI      from './ui.js';
import * as Storage from './storage.js';
import { AppData, emitSave } from './app.js';

let layoutDetectionUnlisten = null;

/* ─────────────────────────────────────────
   INIT — populates form from AppData
───────────────────────────────────────── */

export function init() {
  loadUI();
  startLayoutDetection();
}

function loadUI() {
  const s = AppData.settings;
  setChecked('toggle-theme',    !s.dark);
  setVal('font-size',           s.fontSize);
  setChecked('toggle-sound',    s.sound);
  setVal('difficulty',          s.difficulty);
  setVal('language',            s.language);
  setVal('kb-layout',           s.layout || 'qwerty');
  setVal('text-mode',           s.textMode || 'phrases');
  UI.setText('font-size-lbl', s.fontSize + 'px');
}

/* ─────────────────────────────────────────
   APPLY — reads form → updates AppData
───────────────────────────────────────── */

export function apply() {
  const s = AppData.settings;

  s.dark       = !getChecked('toggle-theme');
  s.fontSize   = parseInt(getVal('font-size'), 10);
  s.sound      = getChecked('toggle-sound');
  s.difficulty = getVal('difficulty');
  s.language   = getVal('language');
  s.layout     = getVal('kb-layout');
  s.textMode   = getVal('text-mode');

  // Apply to DOM
  document.documentElement.setAttribute('data-theme', s.dark ? 'dark' : 'light');
  document.documentElement.style.setProperty('--fs', s.fontSize + 'px');
  UI.setText('font-size-lbl', s.fontSize + 'px');

  emitSave();
}

/* ─────────────────────────────────────────
   KEYBOARD LAYOUT DETECTION
   Uses event.key + event.code to infer layout.
   Allows manual override.
───────────────────────────────────────── */

function startLayoutDetection() {
  stopLayoutDetection();

  const handler = (e) => {
    let detected = null;

    // ABNT2: Ç on Semicolon, ~ on bracket, etc.
    if (e.code === 'Semicolon' && (e.key === 'ç' || e.key === 'Ç')) {
      detected = 'abnt2';
    } else if (e.code === 'Quote' && e.key === 'ã') {
      detected = 'abnt2';
    } else if (e.code === 'BracketLeft' && e.key === '´') {
      detected = 'abnt2';
    }

    // QWERTY signal
    if (e.code === 'Semicolon' && e.key === ';') {
      detected = 'qwerty';
    }

    if (detected && detected !== AppData.settings.layout) {
      AppData.settings.layout = detected;
      setVal('kb-layout', detected);
      UI.setText('layout-detected', detected.toUpperCase() + ' detectado automaticamente');
      emitSave();
    }
  };

  document.addEventListener('keydown', handler, { passive: true });
  layoutDetectionUnlisten = () => document.removeEventListener('keydown', handler);
}

function stopLayoutDetection() {
  layoutDetectionUnlisten?.();
  layoutDetectionUnlisten = null;
}

/* ─────────────────────────────────────────
   DATA ACTIONS
───────────────────────────────────────── */

export function clearSessions() {
  if (!confirm('Apagar histórico de sessões e heatmap?')) return;
  Storage.clearSessions(AppData);
  UI.toast('Histórico apagado ✓', 'success');
}

export function resetAll() {
  if (!confirm('Resetar TODOS os dados? (streak, heatmap, ranking, sessões)')) return;
  Storage.resetAll(AppData);
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

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = val;
}

function getChecked(id) {
  return document.getElementById(id)?.checked ?? false;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getVal(id) {
  return document.getElementById(id)?.value ?? '';
}
