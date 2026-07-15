// Settings: manage categories + export/import a JSON backup.

import * as db from '../db.js';
import { esc } from '../util.js';

const DEFAULT_COLOR = '#6366f1';

export async function render(root, ctx) {
  const categories = await db.getCategories();

  const theme = currentTheme();

  root.innerHTML = `
    <header class="topbar">
      <button class="link-btn" id="done">Done</button>
      <h1>Settings</h1>
      <span style="width:44px"></span>
    </header>

    <main class="settings">
      <h2 class="section-title">Appearance</h2>
      <div class="seg theme-seg">
        <button data-theme-choice="evergreen" class="${theme === 'evergreen' ? 'on' : ''}">Evergreen</button>
        <button data-theme-choice="pink" class="${theme === 'pink' ? 'on' : ''}">Pink</button>
      </div>
      <p class="hint left">Saved on this device. Your Android and iPhone can each have their own look.</p>

      <h2 class="section-title">Categories</h2>
      <ul class="cat-list">
        ${categories.map((c) => `
          <li class="cat-row" data-id="${c.id}">
            <input type="color" class="cat-color" value="${esc(c.colorHex)}" aria-label="Colour">
            <input type="text" class="cat-name" value="${esc(c.name)}" aria-label="Name">
            <button class="cat-del" aria-label="Delete category">✕</button>
          </li>`).join('')}
      </ul>
      <div class="cat-add">
        <input type="color" id="new-color" value="${DEFAULT_COLOR}" aria-label="New colour">
        <input type="text" id="new-name" placeholder="New category" aria-label="New category name">
        <button id="add-cat" class="link-btn strong">Add</button>
      </div>

      <h2 class="section-title">Backup</h2>
      <p class="hint" style="text-align:left">Your tasks live only on this device. Export a backup file
        now and then so you can restore if the browser data is cleared or you switch phones.</p>
      <div class="backup-actions">
        <button id="export" class="wide-btn">Export backup</button>
        <button id="import" class="wide-btn">Import backup</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <p class="hint" id="backup-msg"></p>
    </main>
  `;

  root.querySelector('#done').addEventListener('click', () => ctx.navigate('#/list'));

  root.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.addEventListener('click', () => { applyTheme(b.dataset.themeChoice); ctx.refresh(); }));

  // --- Category edits ---
  root.querySelectorAll('.cat-row').forEach((row) => {
    const id = row.dataset.id;
    const nameEl = row.querySelector('.cat-name');
    const colorEl = row.querySelector('.cat-color');
    const save = async () => {
      const name = nameEl.value.trim();
      if (!name) return;
      await db.saveCategory({ id, name, colorHex: colorEl.value });
    };
    nameEl.addEventListener('change', save);
    colorEl.addEventListener('change', save);
    row.querySelector('.cat-del').addEventListener('click', async () => {
      if (confirm(`Delete category "${nameEl.value}"? Tasks keep existing but become uncategorized.`)) {
        await db.deleteCategory(id);
        ctx.refresh();
      }
    });
  });

  root.querySelector('#add-cat').addEventListener('click', async () => {
    const name = root.querySelector('#new-name').value.trim();
    if (!name) return;
    await db.saveCategory({ name, colorHex: root.querySelector('#new-color').value });
    ctx.refresh();
  });

  // --- Backup ---
  root.querySelector('#export').addEventListener('click', async () => {
    const data = await db.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `dayworth-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(root, 'Backup downloaded.');
  });

  const fileInput = root.querySelector('#import-file');
  root.querySelector('#import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm('Importing will REPLACE all current tasks and categories with the backup. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      const text = await file.text();
      await db.importData(JSON.parse(text));
      setMsg(root, 'Backup restored.');
      ctx.refresh();
    } catch (err) {
      setMsg(root, 'Import failed: ' + err.message);
    }
    fileInput.value = '';
  });
}

function setMsg(root, text) {
  const el = root.querySelector('#backup-msg');
  if (el) el.textContent = text;
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'pink' ? 'pink' : 'evergreen';
}

function applyTheme(name) {
  try { localStorage.setItem('dayworth-theme', name); } catch (e) {}
  if (name === 'pink') document.documentElement.setAttribute('data-theme', 'pink');
  else document.documentElement.removeAttribute('data-theme');
}
