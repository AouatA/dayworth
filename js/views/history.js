// History view: completed tasks grouped by day, newest first.

import * as db from '../db.js';
import { esc, formatDayHeading } from '../util.js';

export async function render(root, ctx) {
  const [days, categories] = await Promise.all([db.getCompletedByDay(), db.getCategories()]);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  root.innerHTML = `
    <header class="topbar"><h1>History</h1></header>
    <main class="history">
      ${days.length === 0
        ? `<p class="empty">Nothing here yet. Complete a task and it'll be recorded by day.</p>`
        : days.map((d) => dayBlock(d, catById)).join('')}
    </main>
  `;

  root.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', () => ctx.navigate(`#/task/${el.dataset.edit}`)));
}

function dayBlock(d, catById) {
  return `
    <section class="day-block">
      <div class="day-head">
        <span class="day-name">${formatDayHeading(d.dayStart)}</span>
        <span class="day-tally">${d.count} task${d.count === 1 ? '' : 's'}
          · <strong>${d.value}</strong> value</span>
      </div>
      <ul class="task-list done">
        ${d.tasks.map((t) => row(t, catById)).join('')}
      </ul>
    </section>`;
}

function row(t, catById) {
  const cat = t.categoryId ? catById[t.categoryId] : null;
  const time = new Date(t.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `
    <li class="task is-done" data-edit="${t.id}">
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${cat ? `<span class="chip" style="--chip:${esc(cat.colorHex)}">${esc(cat.name)}</span>` : ''}
          <span class="due">${esc(time)}</span>
        </div>
      </div>
      <span class="value-badge">${t.value}</span>
    </li>`;
}
