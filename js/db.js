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

export async function deleteTask(id) {
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
  });
  // If this task recurs, spawn the next occurrence as a fresh active task.
  if (t.recurrence) {
    const nextDue = computeNextDue(t.recurrence, t.dueAt);
    await saveTask({
      title: t.title,
      notes: t.notes,
      categoryId: t.categoryId,
      priority: t.priority,
      value: t.value,
      dueAt: nextDue,
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
