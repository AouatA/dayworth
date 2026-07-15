// Small shared helpers: ids, date math, formatting.

export function uid() {
  // Sortable-ish unique id: timestamp + random suffix.
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

// Local midnight (ms) for a given Date/ms. Defaults to now.
export function startOfDay(input = Date.now()) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Midnight ms for the date portion of a yyyy-mm-dd string (local time).
export function dateStringToMs(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ms -> yyyy-mm-dd for <input type="date"> (local time).
export function msToDateString(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ms -> HH:MM for <input type="time"> (local time).
export function msToTimeString(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Combine a yyyy-mm-dd date and an optional HH:MM time into local-time ms.
export function dateTimeToMs(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }
  return new Date(y, m - 1, d).getTime();
}

// Classify a due date: 'overdue' | 'today' | 'upcoming' | null.
// When hasTime is true, "overdue" respects the exact time, not just the day.
export function dueState(dueAt, hasTime) {
  if (dueAt == null) return null;
  const now = Date.now();
  if (hasTime) {
    if (dueAt < now) return 'overdue';
    return startOfDay(dueAt) === startOfDay(now) ? 'today' : 'upcoming';
  }
  const today = startOfDay(now);
  const due = startOfDay(dueAt);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

// Human-friendly due label, e.g. "Today 3:00 PM", "Fri", "2d overdue".
export function formatDue(dueAt, hasTime) {
  if (dueAt == null) return '';
  const today = startOfDay();
  const diffDays = Math.round((startOfDay(dueAt) - today) / DAY_MS);
  let dayPart;
  if (diffDays === 0) dayPart = 'Today';
  else if (diffDays === 1) dayPart = 'Tomorrow';
  else if (diffDays === -1) dayPart = 'Yesterday';
  else if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  else if (diffDays < 7) dayPart = new Date(dueAt).toLocaleDateString(undefined, { weekday: 'short' });
  else dayPart = new Date(dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (hasTime) {
    const timePart = new Date(dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${dayPart} ${timePart}`;
  }
  return dayPart;
}

// Day heading like "Today", "Yesterday", or "Mon, 14 Jul".
export function formatDayHeading(dayMs) {
  const today = startOfDay();
  const diff = Math.round((startOfDay(dayMs) - today) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return new Date(dayMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Escape text for safe insertion into innerHTML.
export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const PRIORITIES = [
  { key: 'LOW', label: 'Low' },
  { key: 'MED', label: 'Medium' },
  { key: 'HIGH', label: 'High' },
];

export const PRIORITY_RANK = { HIGH: 0, MED: 1, LOW: 2 };

// Weekday labels, index 0 = Sunday (matches Date.getDay()).
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Given a recurrence rule and the current due date, return the next due ms (or null).
// Always lands strictly in the future (after today) so overdue tasks don't stack.
export function computeNextDue(recurrence, dueAt) {
  if (!recurrence) return null;
  const today = startOfDay();

  if (recurrence.type === 'EVERY_N_DAYS') {
    const step = Math.max(1, Number(recurrence.intervalDays) || 1);
    const base = dueAt != null ? startOfDay(dueAt) : today;
    let next = base + step * DAY_MS;
    while (next <= today) next += step * DAY_MS;
    return next;
  }

  if (recurrence.type === 'WEEKLY') {
    const days = Array.isArray(recurrence.weekdays) ? recurrence.weekdays : [];
    if (days.length === 0) return null;
    for (let i = 1; i <= 7; i++) {
      const cand = today + i * DAY_MS;
      if (days.includes(new Date(cand).getDay())) return cand;
    }
    return null;
  }
  return null;
}

// Short human label for a recurrence rule.
export function formatRecurrence(recurrence) {
  if (!recurrence) return '';
  if (recurrence.type === 'EVERY_N_DAYS') {
    const n = Number(recurrence.intervalDays) || 1;
    return n === 1 ? 'Daily' : `Every ${n} days`;
  }
  if (recurrence.type === 'WEEKLY') {
    const days = (recurrence.weekdays || []).slice().sort((a, b) => a - b);
    if (days.length === 7) return 'Every day';
    return 'Weekly: ' + days.map((d) => WEEKDAYS[d]).join(', ');
  }
  return '';
}
