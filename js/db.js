// Domain data layer: tasks, categories, completion log.
// Built on the tiny IndexedDB wrapper in idb.js.

import * as idb from './idb.js';
import { uid, startOfDay, DAY_MS, computeNextDue } from './util.js';

const DEFAULT_CATEGORIES = [
  { name: 'Work', colorHex: '#3b82f6' },
  { name: 'Home', colorHex: '#10b981' },
  { name: 'Errands', colorHex: '#f59e0b' },
];

export async function seedIfEmpty() {
  const cats = await idb.getAll('categories');
  if (cats.length === 0) {
    let order = 0;
    for (const c of DEFAULT_CATEGORIES) {
      await idb.put('categories', { id: uid(), sortOrder: order++, ...c });
    }
  }
}

// ---- Categories ----

export async function getCategories() {
  const cats = await idb.getAll('categories');
  return cats.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveCategory(input) {
  let cat;
  if (input.id) {
    const existing = await idb.get('categories', input.id);
    cat = { ...existing, ...input };
  } else {
    const all = await idb.getAll('categories');
    const maxOrder = all.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0);
    cat = { id: uid(), sortOrder: maxOrder + 1, ...input };
  }
  await idb.put('categories', cat);
  return cat;
}

// Delete a category and un-assign it from any tasks that used it.
export async function deleteCategory(id) {
  const tasks = await idb.getAll('tasks');
  for (const t of tasks) {
    if (t.categoryId === id) {
      t.categoryId = null;
      await idb.put('tasks', t);
    }
  }
  await idb.del('categories', id);
}

// ---- Tasks ----

export async function getTasks() {
  return idb.getAll('tasks');
}

export async function getTask(id) {
  return idb.get('tasks', id);
}

// Create or update. New tasks get id/createdAt/sortOrder/defaults filled in.
export async function saveTask(input) {
  const now = Date.now();
  let task;
  if (input.id) {
    const existing = await idb.get('tasks', input.id);
    task = { ...existing, ...input };
  } else {
    const all = await idb.getAll('tasks');
    const maxOrder = all.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), 0);
    task = {
      id: uid(),
      createdAt: now,
      sortOrder: maxOrder + 1,
      isCompleted: false,
      completedAt: null,
      ...input,
    };
  }
  // Normalise value into 1..100.
  task.value = Math.min(100, Math.max(1, Math.round(Number(task.value) || 1)));
  await idb.put('tasks', task);
  return task;
}

// Delete a task AND its completion history so stats/history no longer count it.
export async function deleteTask(id) {
  const logs = (await idb.getAll('completionLog')).filter((l) => l.taskId === id);
  for (const l of logs) await idb.del('completionLog', l.id);
  return idb.del('tasks', id);
}

export async function completeTask(id) {
  const t = await idb.get('tasks', id);
  if (!t || t.isCompleted) return;
  t.isCompleted = true;
  t.completedAt = Date.now();
  await idb.put('tasks', t);
  await idb.put('completionLog', {
    id: uid(),
    taskId: t.id,
    completedAt: t.completedAt,
    value: t.value,
    categoryId: t.categoryId ?? null,
  });
  // If this task recurs, spawn the next occurrence as a fresh active task.
  if (t.recurrence) {
    let nextDue = computeNextDue(t.recurrence, t.dueAt);
    // Preserve the original time-of-day on the next occurrence.
    if (nextDue != null && t.dueHasTime && t.dueAt != null) {
      nextDue = startOfDay(nextDue) + (t.dueAt - startOfDay(t.dueAt));
    }
    await saveTask({
      title: t.title,
      notes: t.notes,
      categoryId: t.categoryId,
      priority: t.priority,
      value: t.value,
      dueAt: nextDue,
      dueHasTime: t.dueHasTime ?? false,
      recurrence: t.recurrence,
    });
  }
}

export async function uncompleteTask(id) {
  const t = await idb.get('tasks', id);
  if (!t || !t.isCompleted) return;
  // Remove this task's most recent completion-log entry so stats stay accurate.
  const logs = (await idb.getAll('completionLog'))
    .filter((l) => l.taskId === id)
    .sort((a, b) => b.completedAt - a.completedAt);
  if (logs[0]) await idb.del('completionLog', logs[0].id);
  t.isCompleted = false;
  t.completedAt = null;
  await idb.put('tasks', t);
}

// ---- Completion log / stats ----

export async function getCompletionLog() {
  return idb.getAll('completionLog');
}

// Summary for a single day (defaults to today): { count, value }.
export async function getDaySummary(dayMs = Date.now()) {
  const start = startOfDay(dayMs);
  const end = start + DAY_MS;
  const logs = await idb.getAll('completionLog');
  let count = 0;
  let value = 0;
  for (const l of logs) {
    if (l.completedAt >= start && l.completedAt < end) {
      count += 1;
      value += l.value;
    }
  }
  return { count, value };
}

// Per-day series for the last `days` days (oldest -> newest).
// Each entry: { start, count, value }.
export async function getDailySeries(days) {
  const logs = await idb.getAll('completionLog');
  const todayStart = startOfDay();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({ start: todayStart - i * DAY_MS, count: 0, value: 0 });
  }
  const first = out[0].start;
  for (const l of logs) {
    const dayStart = startOfDay(l.completedAt);
    const idx = Math.round((dayStart - first) / DAY_MS);
    if (idx >= 0 && idx < out.length) {
      out[idx].count += 1;
      out[idx].value += l.value;
    }
  }
  return out;
}

function buildSeries(logs, days) {
  const todayStart = startOfDay();
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ start: todayStart - i * DAY_MS, count: 0, value: 0 });
  const first = out[0].start;
  for (const l of logs) {
    const idx = Math.round((startOfDay(l.completedAt) - first) / DAY_MS);
    if (idx >= 0 && idx < out.length) { out[idx].count += 1; out[idx].value += l.value; }
  }
  return out;
}

function sumWindow(logs, startInc, endExc) {
  let value = 0, count = 0;
  for (const l of logs) {
    if (l.completedAt >= startInc && l.completedAt < endExc) { value += l.value; count += 1; }
  }
  return { value, count };
}

// Consecutive days (ending today, or yesterday if today is still empty) with >=1 completion.
function computeStreak(logs) {
  const daySet = new Set(logs.map((l) => startOfDay(l.completedAt)));
  let cursor = startOfDay();
  if (!daySet.has(cursor)) cursor -= DAY_MS;
  let streak = 0;
  while (daySet.has(cursor)) { streak += 1; cursor -= DAY_MS; }
  return streak;
}

// Everything the Stats screen needs for a given range (7 or 30 days).
export async function getAnalytics(range) {
  const logs = await idb.getAll('completionLog');
  const series = buildSeries(logs, range);
  const totalValue = series.reduce((s, d) => s + d.value, 0);
  const totalCount = series.reduce((s, d) => s + d.count, 0);
  const best = series.reduce((b, d) => (d.value > b.value ? d : b), { value: -1, start: null });
  const todayStart = startOfDay();

  const thisWeek = sumWindow(logs, todayStart - 6 * DAY_MS, todayStart + DAY_MS);
  const lastWeek = sumWindow(logs, todayStart - 13 * DAY_MS, todayStart - 6 * DAY_MS);

  const firstDay = series[0].start;
  const rangeEnd = todayStart + DAY_MS;
  const byCat = new Map();
  for (const l of logs) {
    if (l.completedAt >= firstDay && l.completedAt < rangeEnd) {
      const k = l.categoryId ?? '__none__';
      const cur = byCat.get(k) || { value: 0, count: 0 };
      cur.value += l.value; cur.count += 1;
      byCat.set(k, cur);
    }
  }
  const byCategory = [...byCat.entries()]
    .map(([id, v]) => ({ categoryId: id === '__none__' ? null : id, value: v.value, count: v.count }))
    .sort((a, b) => b.value - a.value);

  return {
    series, totalValue, totalCount, best,
    avgPerDay: Math.round(totalValue / range),
    avgPerTask: totalCount ? Math.round(totalValue / totalCount) : 0,
    streak: computeStreak(logs),
    thisWeekValue: thisWeek.value,
    lastWeekValue: lastWeek.value,
    byCategory,
  };
}

// Completed tasks grouped by day, newest day first, for the History screen.
export async function getCompletedByDay() {
  const tasks = (await idb.getAll('tasks')).filter((t) => t.isCompleted && t.completedAt);
  const byDay = new Map();
  for (const t of tasks) {
    const day = startOfDay(t.completedAt);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(t);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayStart, list]) => {
      list.sort((a, b) => b.completedAt - a.completedAt);
      return { dayStart, tasks: list, count: list.length, value: list.reduce((s, t) => s + t.value, 0) };
    });
}

// ---- Backup (export / import) ----

export async function exportData() {
  const [tasks, categories, completionLog] = await Promise.all([
    idb.getAll('tasks'),
    idb.getAll('categories'),
    idb.getAll('completionLog'),
  ]);
  return { app: 'dayworth', version: 1, exportedAt: Date.now(), tasks, categories, completionLog };
}

// Replace all data with the contents of a backup object. Basic shape validation.
export async function importData(data) {
  if (!data || data.app !== 'dayworth' || !Array.isArray(data.tasks)) {
    throw new Error('This file is not a DayWorth backup.');
  }
  await Promise.all([
    idb.clearStore('tasks'),
    idb.clearStore('categories'),
    idb.clearStore('completionLog'),
  ]);
  for (const c of data.categories || []) await idb.put('categories', c);
  for (const t of data.tasks) await idb.put('tasks', t);
  for (const l of data.completionLog || []) await idb.put('completionLog', l);
}
