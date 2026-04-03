/* ═══════════════════════════════════════════
   analysis.js — Página de Análise
   Heatmap, gráficos, ranking, comparações
═══════════════════════════════════════════ */

import * as UI from './ui.js';
import { AppData } from './app.js';

/* ─────────────────────────────────────────
   INIT — chama todos os sub-renders
───────────────────────────────────────── */

export function init() {
  UI.buildKeyboard('analysis-keyboard', '', AppData.settings.layout || 'qwerty');
  UI.applyHeatmapToContainer('analysis-keyboard', AppData.keyboard);
  renderProblemKeys();
  renderSessionChart();
  renderCompetitiveComparison();
  renderRankingTables();
}

/* ─────────────────────────────────────────
   PROBLEM KEYS LIST
───────────────────────────────────────── */

function renderProblemKeys() {
  const container = document.getElementById('problem-keys-list');
  if (!container) return;

  const keys = Object.entries(AppData.keyboard)
    .filter(([, v]) => (v.hits + v.errors) >= 5)
    .map(([k, v]) => {
      const total = v.hits + v.errors;
      // Corrected formula: errors / (hits + errors)
      const rate  = v.errors / total;
      return { key: k, rate, hits: v.hits, errors: v.errors, total };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  if (!keys.length) {
    container.innerHTML = '<div class="empty-state">Pratique mais para gerar dados</div>';
    return;
  }

  container.innerHTML = keys.map(k => {
    const pct  = Math.round(k.rate * 100);
    const tier = pct >= 30 ? 'high' : pct >= 10 ? 'mid' : 'low';
    return `
      <div class="pk-row">
        <div class="pk-key heat-${tier}">${k.key.toUpperCase()}</div>
        <div class="pk-bar-wrap">
          <div class="pk-bar heat-${tier}" style="width:${pct}%"></div>
        </div>
        <div class="pk-pct">${pct}% erro · ${k.errors}/${k.total}</div>
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   SESSION WPM CHART
───────────────────────────────────────── */

function renderSessionChart() {
  const container = document.getElementById('session-chart');
  if (!container) return;

  const sessions = [...AppData.stats.sessions].slice(0, 10).reverse();
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-state" style="width:100%;text-align:center">Sem dados ainda</div>';
    return;
  }

  const maxWPM = Math.max(...sessions.map(s => s.wpm), 1);

  container.innerHTML = sessions.map((s, i) => {
    const barH = Math.max(4, Math.round((s.wpm / maxWPM) * 72));
    return `
      <div class="chart-col" title="${s.date}: ${s.wpm} WPM, ${s.acc}% precisão">
        <div class="chart-bar" style="height:${barH}px">
          <span class="chart-val">${s.wpm}</span>
        </div>
        <div class="chart-lbl">${i + 1}</div>
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   COMPETITIVE COMPARISON
───────────────────────────────────────── */

function renderCompetitiveComparison() {
  const container = document.getElementById('competitive-summary');
  if (!container) return;

  const sessions = AppData.stats.sessions;
  if (sessions.length < 2) {
    container.innerHTML = '<div class="empty-state">Complete pelo menos 2 sessões para comparar</div>';
    return;
  }

  const cur  = sessions[0];
  const prev = sessions[1];
  const dWPM = cur.wpm - prev.wpm;
  const dAcc = cur.acc - prev.acc;

  const deltaClass = (v) => v >= 0 ? 'pos' : 'neg';
  const deltaFmt   = (v) => (v >= 0 ? '+' : '') + v;

  container.innerHTML = `
    <div class="comp-grid">
      <div class="comp-item">
        <div class="comp-val accent">${cur.wpm}</div>
        <div class="comp-lbl">Última WPM</div>
      </div>
      <div class="comp-item">
        <div class="comp-val muted">${prev.wpm}</div>
        <div class="comp-lbl">Anterior WPM</div>
      </div>
      <div class="comp-item">
        <div class="comp-val ${deltaClass(dWPM)}">${deltaFmt(dWPM)}</div>
        <div class="comp-lbl">Δ WPM</div>
      </div>
      <div class="comp-item">
        <div class="comp-val ${deltaClass(dAcc)}">${deltaFmt(dAcc)}%</div>
        <div class="comp-lbl">Δ Precisão</div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────
   RANKING TABLES
───────────────────────────────────────── */

function renderRankingTables() {
  const { ranking, streak } = AppData;

  // WPM ranking
  renderRankingList('rank-wpm', ranking.wpm, r => `${r.wpm} WPM · ${r.acc}% · ${r.date}`);

  // Accuracy ranking
  renderRankingList('rank-acc', ranking.accuracy, r => `${r.acc}% · ${r.wpm} WPM · ${r.date}`);

  // Consistency ranking
  renderRankingList('rank-cons', ranking.consistency, r => `Score ${r.score} · ${r.wpm} WPM · ${r.date}`);

  // Streak info
  UI.setText('rank-streak-current', streak.current + ' dias');
  UI.setText('rank-streak-best',    (ranking.bestStreak || 0) + ' dias');
}

function renderRankingList(containerId, data, formatter) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!data?.length) {
    el.innerHTML = '<div class="empty-state">Sem dados</div>';
    return;
  }
  el.innerHTML = data.map((r, i) =>
    `<div class="rank-row">
      <span class="rank-pos">${['🥇','🥈','🥉'][i] || (i + 1)}</span>
      <span class="rank-val">${formatter(r)}</span>
    </div>`
  ).join('');
}
