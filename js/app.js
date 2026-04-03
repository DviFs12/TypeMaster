/* ═══════════════════════════════════════════
   app.js — Orquestrador principal
   Navegação, estado global, boot
═══════════════════════════════════════════ */

import * as Storage  from './storage.js';
import * as UI       from './ui.js';
import * as Practice from './practice.js';
import * as Training from './training.js';
import * as Analysis from './analysis.js';
import * as Settings from './settings.js';
import * as KBL      from './keyboard-layout.js';

/* ─────────────────────────────────────────
   ESTADO GLOBAL COMPARTILHADO
   Exportado para todos os módulos usarem
───────────────────────────────────────── */

export let AppData = Storage.load();

/** Persist AppData — call after any mutation */
export function emitSave() {
  Storage.save(AppData);
}

/* ─────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────── */

const PAGE_INITS = {
  home:          updateHome,
  pratica:       () => Practice.init(),
  treino:        () => Training.init(),
  analise:       () => Analysis.init(),
  configuracoes: () => Settings.init()
};

export function navigate(pageId) {
  // Deactivate all pages and nav buttons
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Activate target page
  document.getElementById(pageId)?.classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

  // Run page-specific init
  PAGE_INITS[pageId]?.();
}

/* ─────────────────────────────────────────
   HOME PAGE
───────────────────────────────────────── */

function updateHome() {
  const { sessions, bestWPM, avgAccuracy } = AppData.stats;
  const { current: streakDays } = AppData.streak;

  UI.setText('home-best-wpm',  bestWPM     ? bestWPM         : '—');
  UI.setText('home-avg-acc',   avgAccuracy ? avgAccuracy + '%' : '—');
  UI.setText('home-sessions',  sessions.length);

  const s = streakDays;
  UI.setText('streak-badge', s > 0 ? `${s} dia${s !== 1 ? 's' : ''} 🔥` : '— dias');

  renderHistory(sessions);
}

function renderHistory(sessions) {
  const list = document.getElementById('history-list');
  if (!list) return;

  if (!sessions.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma sessão ainda. Comece a praticar!</div>';
    return;
  }

  list.innerHTML = sessions.slice(0, 8).map(s => `
    <div class="history-item">
      <span>${s.date}</span>
      <span class="wpm-val">${s.wpm} WPM</span>
      <span>${s.acc}% prec.</span>
      <span>${s.elapsed || '—'}s</span>
      <span class="mode-tag">${s.mode || 'normal'}</span>
    </div>`).join('');
}

/* ─────────────────────────────────────────
   COUNTDOWN UTILITY
───────────────────────────────────────── */

export function countdown(cb) {
  const overlay = document.getElementById('countdown-overlay');
  const numEl   = document.getElementById('countdown-num');
  if (!overlay || !numEl) { cb(); return; }

  overlay.classList.remove('hidden');
  let n = 3;
  numEl.textContent = n;

  const tick = () => {
    n--;
    if (n <= 0) {
      overlay.classList.add('hidden');
      cb();
    } else {
      numEl.textContent = n;
      // Retrigger animation
      numEl.style.animation = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        numEl.style.animation = 'cPop 1s ease-out';
      }));
      setTimeout(tick, 1000);
    }
  };
  setTimeout(tick, 1000);
}

/* ─────────────────────────────────────────
   FOCUS MODE
───────────────────────────────────────── */

let focusMode = false;

export function toggleFocus() {
  focusMode = !focusMode;
  document.body.classList.toggle('focus-mode', focusMode);
  UI.setText('focus-btn', focusMode ? '✕ Sair foco' : 'Foco');
  UI.toast(focusMode ? 'Modo foco ativado' : 'Modo foco desativado');
}

/* ─────────────────────────────────────────
   EVENT WIRING
───────────────────────────────────────── */

function wireEvents() {
  // Practice input
  document.getElementById('typing-input')
    ?.addEventListener('input', e => Practice.handleInput(e));

  // Training input
  document.getElementById('train-input')
    ?.addEventListener('input', e => Training.handleInput(e));

  // Keep practice input focused while on practice page
  document.addEventListener('keydown', () => {
    const active = document.querySelector('.page.active');
    if (active?.id === 'pratica') Practice.focusInput();
  }, { passive: true });

  // Click anywhere on practice area focuses input
  document.getElementById('pratica')?.addEventListener('click', e => {
    if (!e.target.closest('.btn, .results-panel, .mode-selector')) {
      Practice.focusInput();
    }
  });

  // Click training area focuses train input
  document.getElementById('treino')?.addEventListener('click', e => {
    if (!e.target.closest('.btn')) Training.focusInput();
  });
}

/* ─────────────────────────────────────────
   PWA / SERVICE WORKER
───────────────────────────────────────── */

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              UI.toast('Nova versão disponível — recarregue para atualizar', 'warning');
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

/* ─────────────────────────────────────────
   BOOT
───────────────────────────────────────── */

function boot() {
  // Apply saved settings immediately
  const s = AppData.settings;
  document.documentElement.setAttribute('data-theme', s.dark ? 'dark' : 'light');
  document.documentElement.style.setProperty('--fs', s.fontSize + 'px');

  // Check streak on load
  Storage.checkStreak(AppData);
  Storage.save(AppData);

  wireEvents();
  updateHome();
  registerSW();

  // Start layout detection globally from boot —
  // so it works even if user never visits Settings page
  KBL.startDetection();
  KBL.onLayoutDetected((layout, source) => {
    if (source === 'auto') {
      AppData.settings.layout = layout;
      Storage.save(AppData);
    }
  });

  // Handle deep links via hash
  const hash = window.location.hash.slice(1);
  if (hash && PAGE_INITS[hash]) navigate(hash);
}

// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ─────────────────────────────────────────
   GLOBAL BINDINGS (called from HTML onclick)
───────────────────────────────────────── */

window.App = {
  navigate,
  toggleFocus,
  countdown
};

window.Practice = {
  init:       () => Practice.init(),
  setMode:    m  => Practice.setMode(m),
  restart:    () => Practice.restart(),
  nextPhrase: () => Practice.nextPhrase(),
  focusInput: () => Practice.focusInput()
};

window.Training = {
  restart:    () => Training.restart(),
  prev:       () => Training.prev(),
  next:       () => Training.next(),
  focusInput: () => Training.focusInput()
};

window.Settings = {
  apply:         () => Settings.apply(),
  applyLayout:   () => Settings.applyLayout(),
  clearSessions: () => Settings.clearSessions(),
  resetAll:      () => Settings.resetAll(),
  installPWA:    () => Settings.installPWA()
};
