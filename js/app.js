// App entry: seeds data, wires hash routing + bottom nav, registers service worker.

import { seedIfEmpty } from './db.js';
import * as listView from './views/list.js';
import * as editorView from './views/editor.js';
import * as statsView from './views/stats.js';
import * as settingsView from './views/settings.js';

const root = document.getElementById('view');
const nav = document.getElementById('nav');

const ctx = {
  navigate(hash) { location.hash = hash; },
  refresh() { route(); },
};

async function route() {
  const hash = location.hash || '#/list';
  const parts = hash.slice(2).split('/'); // e.g. ['task','new']

  if (parts[0] === 'task') {
    await editorView.render(root, ctx, parts[1]);
    setNav(null);
  } else if (parts[0] === 'settings') {
    await settingsView.render(root, ctx);
    setNav(null);
  } else if (parts[0] === 'stats') {
    await statsView.render(root, ctx);
    setNav('stats');
  } else {
    await listView.render(root, ctx);
    setNav('list');
  }
}

function setNav(active) {
  if (active === null) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  nav.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === active);
  });
}

nav.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => ctx.navigate(b.dataset.nav === 'stats' ? '#/stats' : '#/list'));
});

window.addEventListener('hashchange', route);

async function start() {
  await seedIfEmpty();
  await route();
}

start();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
