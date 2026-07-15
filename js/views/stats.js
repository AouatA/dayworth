// Stats view: today's worth hero, a canvas trend chart, key metrics,
// week-over-week, and a value-by-category breakdown.

import * as db from '../db.js';

let range = 7;        // 7 | 30
let metric = 'value'; // 'value' | 'count'

export async function render(root, ctx) {
  const [a, categories] = await Promise.all([db.getAnalytics(range), db.getCategories()]);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const today = a.series[a.series.length - 1];

  const delta = a.thisWeekValue - a.lastWeekValue;
  const deltaPct = a.lastWeekValue > 0 ? Math.round((delta / a.lastWeekValue) * 100) : null;
  const maxCat = Math.max(1, ...a.byCategory.map((c) => c.value));

  root.innerHTML = `
    <header class="topbar"><h1>Stats</h1></header>
    <main class="stats">
      <section class="worth-hero">
        <div class="worth-eyebrow">Today's worth</div>
        <div class="worth-value">${today.value}</div>
        <div class="worth-sub">${today.count} task${today.count === 1 ? '' : 's'} completed
          · avg ${a.avgPerDay}/day over ${range}d</div>
      </section>

      <div class="chart-controls">
        <div class="seg" role="tablist" aria-label="Metric">
          <button data-metric="value" class="${metric === 'value' ? 'on' : ''}">Value</button>
          <button data-metric="count" class="${metric === 'count' ? 'on' : ''}">Tasks</button>
        </div>
        <div class="seg" role="tablist" aria-label="Range">
          <button data-range="7" class="${range === 7 ? 'on' : ''}">7 days</button>
          <button data-range="30" class="${range === 30 ? 'on' : ''}">30 days</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="chart" height="200"></canvas></div>

      <section class="tiles">
        ${tile(a.streak, a.streak === 1 ? 'day streak' : 'day streak', '🔥')}
        ${tile(a.avgPerTask, 'avg / task')}
        ${tile(a.totalValue, `value · ${range}d`)}
        ${tile(a.best.value > 0 ? a.best.value : 0, 'best day')}
      </section>

      <section class="wow">
        <div class="wow-head">This week vs last</div>
        <div class="wow-body">
          <span class="wow-now">${a.thisWeekValue}</span>
          <span class="wow-prev">was ${a.lastWeekValue}</span>
          ${deltaPct === null
            ? `<span class="wow-delta flat">—</span>`
            : `<span class="wow-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(deltaPct)}%</span>`}
        </div>
      </section>

      <h2 class="section-title">Value by category · ${range}d</h2>
      ${a.byCategory.length === 0
        ? `<p class="hint left">Complete some tasks and your category breakdown appears here.</p>`
        : `<div class="cat-bars">${a.byCategory.map((c) => catBar(c, catById, maxCat)).join('')}</div>`}
    </main>
  `;

  root.querySelectorAll('[data-metric]').forEach((b) =>
    b.addEventListener('click', () => { metric = b.dataset.metric; ctx.refresh(); }));
  root.querySelectorAll('[data-range]').forEach((b) =>
    b.addEventListener('click', () => { range = Number(b.dataset.range); ctx.refresh(); }));

  requestAnimationFrame(() => drawChart(root.querySelector('#chart'), a.series));
}

function tile(num, label, icon) {
  return `<div class="tile">
    <div class="tile-num">${icon ? `<span class="tile-ico">${icon}</span>` : ''}${num}</div>
    <div class="tile-lbl">${label}</div>
  </div>`;
}

function catBar(c, catById, maxCat) {
  const cat = c.categoryId ? catById[c.categoryId] : null;
  const name = cat ? cat.name : 'Uncategorized';
  const color = cat ? cat.colorHex : 'var(--muted)';
  const pct = Math.round((c.value / maxCat) * 100);
  return `
    <div class="cat-bar-row">
      <div class="cat-bar-top"><span>${escapeHtml(name)}</span><strong>${c.value}</strong></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart(canvas, series) {
  if (!canvas) return;
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = 200;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const barColor = metric === 'value' ? (cssVar('--gold') || '#C08A2D') : (cssVar('--brand') || '#1F6F5C');
  const muted = cssVar('--muted') || '#888';
  const line = cssVar('--line') || '#ddd';

  const values = series.map((d) => (metric === 'value' ? d.value : d.count));
  const maxVal = Math.max(1, ...values);

  const padL = 30, padR = 6, padT = 10, padB = 20;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;
  const n = series.length;
  const slot = plotW / n;
  const barW = Math.max(2, slot * 0.6);

  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 2; i++) {
    const val = Math.round((maxVal / 2) * i);
    const y = padT + plotH - plotH * (val / maxVal);
    ctx.strokeStyle = line;
    ctx.globalAlpha = i === 0 ? 1 : 0.55;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssWidth - padR, y); ctx.stroke();
    ctx.fillStyle = muted; ctx.fillText(String(val), padL - 5, y);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = barColor;
  series.forEach((d, i) => {
    const v = metric === 'value' ? d.value : d.count;
    const h = plotH * (v / maxVal);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + plotH - h;
    roundRect(ctx, x, y, barW, h, Math.min(3, barW / 2));
    ctx.fill();
  });

  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const every = n <= 7 ? 1 : Math.ceil(n / 6);
  series.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const x = padL + i * slot + slot / 2;
    ctx.fillText(dayLabel(d.start, n > 7), x, padT + plotH + 5);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  const rr = Math.min(r, h);
  ctx.beginPath();
  ctx.moveTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function dayLabel(ms, asDate) {
  const d = new Date(ms);
  if (asDate) return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}
