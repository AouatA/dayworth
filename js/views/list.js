// Task list (home) view.

import * as db from '../db.js';
import { esc, formatDue, dueState, formatRecurrence, valueColor, PRIORITY_RANK } from '../util.js';

const PRIORITY_LABEL = { HIGH: 'High', MED: 'Med', LOW: 'Low' };

// Session-scoped view state (persists across re-renders).
let activeFilter = 'all';   // 'all' | categoryId | 'none'
let sortMode = 'smart';     // 'smart' | 'due' | 'priority' | 'value'

export async function render(root, ctx) {
  const [tasks, categories, today] = await Promise.all([
    db.getTasks(),
    db.getCategories(),
    db.getDaySummary(),
  ]);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  // Reset a stale filter if its category was deleted.
  if (activeFilter !== 'all' && activeFilter !== 'none' && !catById[activeFilter]) {
    activeFilter = 'all';
  }

  const matchesFilter = (t) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'none') return !t.categoryId;
    return t.categoryId === activeFilter;
  };

  const active = tasks.filter((t) => !t.isCompleted && matchesFilter(t)).sort(sorter(sortMode));
  const doneToday = tasks
    .filter((t) => t.isCompleted && isToday(t.completedAt) && matchesFilter(t))
    .sort((a, b) => b.completedAt - a.completedAt);

  root.innerHTML = `
    <header class="topbar">
      <h1>DayWorth</h1>
      <div class="topbar-right">
        <div class="today-pill" title="Completed today">
          <span class="today-count">${today.count}</span> done ·
          <span class="today-value">${today.value}</span> value
        </div>
        <button class="icon-btn" id="open-settings" aria-label="Settings">⚙</button>
      </div>
    </header>

    <div class="filterbar">
      <div class="chips">
        ${filterChip('all', 'All')}
        ${categories.map((c) => filterChip(c.id, c.name, c.colorHex)).join('')}
        ${filterChip('none', 'Uncategorized')}
      </div>
      <select id="sort" class="sort-select" aria-label="Sort tasks">
        <option value="smart" ${sortMode === 'smart' ? 'selected' : ''}>Smart</option>
        <option value="due" ${sortMode === 'due' ? 'selected' : ''}>By due date</option>
        <option value="priority" ${sortMode === 'priority' ? 'selected' : ''}>By priority</option>
        <option value="value" ${sortMode === 'value' ? 'selected' : ''}>By value</option>
      </select>
    </div>

    <main class="list-main">
      ${active.length === 0
        ? `<p class="empty">No tasks here. Tap <strong>+</strong> to add one.</p>`
        : `<ul class="task-list">${active.map((t) => taskRow(t, catById)).join('')}</ul>`}

      ${doneToday.length
        ? `<h2 class="section-title">Completed today</h2>
           <ul class="task-list done">${doneToday.map((t) => taskRow(t, catById)).join('')}</ul>`
        : ''}
    </main>

    <button class="fab" id="add-task" aria-label="Add task">+</button>
  `;

  root.querySelector('#add-task').addEventListener('click', () => ctx.navigate('#/task/new'));
  root.querySelector('#open-settings').addEventListener('click', () => ctx.navigate('#/settings'));

  root.querySelector('#sort').addEventListener('change', (e) => {
    sortMode = e.target.value;
    ctx.refresh();
  });

  root.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      activeFilter = el.dataset.filter;
      ctx.refresh();
    });
  });

  root.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.toggle;
      const task = tasks.find((t) => t.id === id);
      if (task.isCompleted) await db.uncompleteTask(id);
      else await db.completeTask(id);
      ctx.refresh();
    });
  });

  root.querySelectorAll('[data-edit]').forEach((el) => {
    el.addEventListener('click', () => ctx.navigate(`#/task/${el.dataset.edit}`));
  });
}

function filterChip(key, label, color) {
  const active = activeFilter === key ? 'active' : '';
  const style = color ? `style="--chip:${esc(color)}"` : '';
  return `<button class="filter-chip ${active}" data-filter="${esc(key)}" ${style}>${esc(label)}</button>`;
}

function taskRow(t, catById) {
  const cat = t.categoryId ? catById[t.categoryId] : null;
  // Due-state coloring only matters for still-open tasks.
  const state = t.isCompleted ? null : dueState(t.dueAt, t.dueHasTime);
  const dueLabel = t.isCompleted ? '' : formatDue(t.dueAt, t.dueHasTime);
  const recLabel = formatRecurrence(t.recurrence);
  return `
    <li class="task ${t.isCompleted ? 'is-done' : ''} ${state ? 'due-' + state : ''}">
      <button class="check" data-toggle="${t.id}" aria-label="Toggle complete">
        ${t.isCompleted ? '✓' : ''}
      </button>
      <div class="task-body" data-edit="${t.id}">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${cat ? `<span class="chip" style="--chip:${esc(cat.colorHex)}">${esc(cat.name)}</span>` : ''}
          ${t.priority && t.priority !== 'LOW' ? `<span class="prio prio-${t.priority}">${PRIORITY_LABEL[t.priority]}</span>` : ''}
          ${dueLabel ? `<span class="due">${esc(dueLabel)}</span>` : ''}
          ${recLabel ? `<span class="recur" title="${esc(recLabel)}">↻</span>` : ''}
        </div>
      </div>
      <span class="value-badge" title="Value" style="--vc:${valueColor(t.value)}">${t.value}</span>
    </li>
  `;
}

function isToday(ms) {
  if (ms == null) return false;
  const d = new Date(ms);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function dueRank(t) {
  const s = dueState(t.dueAt, t.dueHasTime);
  if (s === 'overdue') return 0;
  if (s === 'today') return 1;
  if (s === 'upcoming') return 2;
  return 3;
}

// Returns a comparator for the chosen sort mode.
function sorter(mode) {
  if (mode === 'value') return (a, b) => b.value - a.value || dueRank(a) - dueRank(b);
  if (mode === 'priority') {
    return (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || dueRank(a) - dueRank(b);
  }
  if (mode === 'due') {
    return (a, b) => {
      const av = a.dueAt ?? Infinity;
      const bv = b.dueAt ?? Infinity;
      return av - bv || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    };
  }
  // smart: overdue/today/upcoming first, then soonest due, then manual order
  return (a, b) => {
    const ra = dueRank(a), rb = dueRank(b);
    if (ra !== rb) return ra - rb;
    if (a.dueAt != null && b.dueAt != null && a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  };
}
