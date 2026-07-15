// Stats view: today's numbers + a canvas bar chart of value or task count
// over the last 7 or 30 days, with range/metric toggles.

import * as db from '../db.js';

let range = 7;        // 7 | 30
let metric = 'value'; // 'value' | 'count'

export async function render(root, ctx) {
  const series = await db.getDailySeries(range);
  const today = series[series.length - 1];

  const totalValue = series.reduce((s, d) => s + d.value, 0);
  const totalCount = series.reduce((s, d) => s + d.count, 0);
  const best = series.reduce((b, d) => (d.value > b.value ? d : b), { value: -1 });

  root.innerHTML = `
    <header class="topbar"><h1>Stats</h1></header>
    <main class="stats">
      <section class="today-card">
        <div class="metric"><span class="num">${today.count}</span><span class="lbl">tasks today</span></div>
        <div class="metric"><span class="num">${today.value}</span><span class="lbl">value today</span></div>
      </section>

      <div class="chart-controls">
        <div class="seg">
          <button data-metric="value" class="${metric === 'value' ? 'on' : ''}">Value</button>
          <button data-metric="count" class="${metric === 'count' ? 'on' : ''}">Tasks</button>
        </div>
        <div class="seg">
          <button data-range="7" class="${range === 7 ? 'on' : ''}">7 days</button>
          <button data-range="30" class="${range === 30 ? 'on' : ''}">30 days</button>
        </div>
      </div>

      <div class="chart-wrap"><canvas id="chart" height="220"></canvas></div>

      <section class="summary">
        <div class="sum-row"><span>Total value (${range}d)</span><strong>${totalValue}</strong></div>
        <div class="sum-row"><span>Tasks completed (${range}d)</span><strong>${totalCount}</strong></div>
        <div class="sum-row"><span>Best day</span><strong>${best.value > 0 ? `${best.value} on ${dayLabel(best.start, true)}` : '—'}</strong></div>
      </section>
    </main>
  `;

  root.querySelectorAll('[data-metric]').forEach((b) =>
    b.addEventListener('click', () => { metric = b.dataset.metric; ctx.refresh(); }));
  root.querySelectorAll('[data-range]').forEach((b) =>
    b.addEventListener('click', () => { range = Number(b.dataset.range); ctx.refresh(); }));

  // Draw after layout so the canvas has a real width.
  requestAnimationFrame(() => drawChart(root.querySelector('#chart'), series));
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart(canvas, series) {
  if (!canvas) return;
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const accent = cssVar('--accent') || '#4f46e5';
  const muted = cssVar('--muted') || '#888';
  const border = cssVar('--border') || '#ddd';

  const values = series.map((d) => (metric === 'value' ? d.value : d.count));
  const maxVal = Math.max(1, ...values);

  const padL = 32, padR = 8, padT = 12, padB = 22;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;
  const n = series.length;
  const slot = plotW / n;
  const barW = Math.max(2, slot * 0.62);

  // Baseline + a couple of gridlines with labels.
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const ticks = 2;
  for (let i = 0; i <= ticks; i++) {
    const val = Math.round((maxVal / ticks) * i);
    const y = padT + plotH - (plotH * (val / maxVal));
    ctx.globalAlpha = i === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssWidth - padR, y);
    ctx.stroke();
    ctx.fillText(String(val), padL - 6, y);
  }
  ctx.globalAlpha = 1;

  // Bars.
  ctx.fillStyle = accent;
  series.forEach((d, i) => {
    const v = metric === 'value' ? d.value : d.count;
    const h = plotH * (v / maxVal);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + plotH - h;
    roundRect(ctx, x, y, barW, h, Math.min(4, barW / 2));
    ctx.fill();
  });

  // X labels: weekdays for 7-day, sparse dates for 30-day.
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelEvery = n <= 7 ? 1 : Math.ceil(n / 6);
  series.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
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
