// Task editor view (create + edit).

import * as db from '../db.js';
import { esc, msToDateString, msToTimeString, dateTimeToMs, valueColor, PRIORITIES, WEEKDAYS } from '../util.js';

export async function render(root, ctx, taskId) {
  const isNew = !taskId || taskId === 'new';
  const [categories, task] = await Promise.all([
    db.getCategories(),
    isNew ? Promise.resolve(null) : db.getTask(taskId),
  ]);

  if (!isNew && !task) {
    ctx.navigate('#/list');
    return;
  }

  const t = task || { title: '', notes: '', categoryId: '', priority: 'LOW', value: 10, dueAt: null, dueHasTime: false, recurrence: null };
  const rec = t.recurrence || null;
  const recType = rec ? rec.type : 'NONE';
  const recInterval = rec && rec.type === 'EVERY_N_DAYS' ? rec.intervalDays : 2;
  const recWeekdays = rec && rec.type === 'WEEKLY' ? rec.weekdays : [];

  root.innerHTML = `
    <header class="topbar">
      <button class="link-btn" id="cancel">Cancel</button>
      <h1>${isNew ? 'New task' : 'Edit task'}</h1>
      <button class="link-btn strong" id="save">Save</button>
    </header>

    <main class="editor">
      <label class="field">
        <span>Title <small class="field-hint">required</small></span>
        <input type="text" id="f-title" value="${esc(t.title)}" placeholder="What needs doing?" autofocus>
      </label>

      <label class="field">
        <span>Notes</span>
        <textarea id="f-notes" rows="3" placeholder="Optional details">${esc(t.notes || '')}</textarea>
      </label>

      <label class="field">
        <span>Category</span>
        <select id="f-category">
          <option value="">None</option>
          ${categories.map((c) => `<option value="${c.id}" ${c.id === t.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span>Priority</span>
        <select id="f-priority">
          ${PRIORITIES.map((p) => `<option value="${p.key}" ${p.key === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </label>

      <div class="field">
        <span>Due date &amp; time <small class="field-hint">optional</small></span>
        <div class="due-row">
          <input type="date" id="f-due" value="${msToDateString(t.dueAt)}">
          <input type="time" id="f-due-time" value="${t.dueHasTime ? msToTimeString(t.dueAt) : ''}" aria-label="Due time">
        </div>
      </div>

      <div class="field">
        <span>Repeat</span>
        <select id="f-rec-type">
          <option value="NONE" ${recType === 'NONE' ? 'selected' : ''}>Does not repeat</option>
          <option value="EVERY_N_DAYS" ${recType === 'EVERY_N_DAYS' ? 'selected' : ''}>Every N days</option>
          <option value="WEEKLY" ${recType === 'WEEKLY' ? 'selected' : ''}>Weekly on…</option>
        </select>
        <div id="rec-ndays" class="rec-sub" ${recType === 'EVERY_N_DAYS' ? '' : 'hidden'}>
          <label class="inline">Every
            <input type="number" id="f-rec-interval" min="1" max="365" value="${recInterval}"> day(s)
          </label>
        </div>
        <div id="rec-weekly" class="rec-sub weekday-row" ${recType === 'WEEKLY' ? '' : 'hidden'}>
          ${WEEKDAYS.map((w, i) => `
            <label class="weekday">
              <input type="checkbox" class="f-weekday" value="${i}" ${recWeekdays.includes(i) ? 'checked' : ''}>
              <span>${w}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="field">
        <span>Value <output id="value-out">${t.value}</output></span>
        <input type="range" id="f-value" min="1" max="100" value="${t.value}">
        <div class="value-scale"><span>1</span><span>how valuable is finishing this?</span><span>100</span></div>
      </div>

      ${isNew ? '' : `<button class="danger-btn" id="delete">Delete task</button>`}
    </main>
  `;

  const valueInput = root.querySelector('#f-value');
  const valueOut = root.querySelector('#value-out');
  const paintValue = () => {
    const c = `rgb(${valueColor(valueInput.value)})`;
    valueOut.textContent = valueInput.value;
    valueOut.style.color = c;
    valueInput.style.accentColor = c;
  };
  paintValue();
  valueInput.addEventListener('input', paintValue);

  const recTypeSel = root.querySelector('#f-rec-type');
  recTypeSel.addEventListener('change', () => {
    root.querySelector('#rec-ndays').hidden = recTypeSel.value !== 'EVERY_N_DAYS';
    root.querySelector('#rec-weekly').hidden = recTypeSel.value !== 'WEEKLY';
  });

  root.querySelector('#cancel').addEventListener('click', () => history.back());

  root.querySelector('#save').addEventListener('click', async () => {
    const title = root.querySelector('#f-title').value.trim();
    if (!title) {
      root.querySelector('#f-title').focus();
      return;
    }
    const dateStr = root.querySelector('#f-due').value;
    const timeStr = root.querySelector('#f-due-time').value;
    const input = {
      title,
      notes: root.querySelector('#f-notes').value.trim(),
      categoryId: root.querySelector('#f-category').value || null,
      priority: root.querySelector('#f-priority').value,
      dueAt: dateTimeToMs(dateStr, timeStr),
      dueHasTime: !!(dateStr && timeStr),
      value: Number(valueInput.value),
      recurrence: buildRecurrence(root),
    };
    if (!isNew) input.id = t.id;
    await db.saveTask(input);
    ctx.navigate('#/list');
  });

  function buildRecurrence(scope) {
    const type = scope.querySelector('#f-rec-type').value;
    if (type === 'EVERY_N_DAYS') {
      const n = Math.max(1, Number(scope.querySelector('#f-rec-interval').value) || 1);
      return { type, intervalDays: n };
    }
    if (type === 'WEEKLY') {
      const days = [...scope.querySelectorAll('.f-weekday:checked')].map((c) => Number(c.value));
      if (days.length === 0) return null; // no days picked -> treat as non-repeating
      return { type, weekdays: days };
    }
    return null;
  }

  const deleteBtn = root.querySelector('#delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Delete this task?')) {
        await db.deleteTask(t.id);
        ctx.navigate('#/list');
      }
    });
  }
}
