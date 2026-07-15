// Minimal promise-based IndexedDB wrapper. No external dependencies.
// Stores: tasks, categories, completionLog.

const DB_NAME = 'dayworth';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tasks')) {
        const s = db.createObjectStore('tasks', { keyPath: 'id' });
        s.createIndex('isCompleted', 'isCompleted');
        s.createIndex('completedAt', 'completedAt');
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('completionLog')) {
        const s = db.createObjectStore('completionLog', { keyPath: 'id' });
        s.createIndex('completedAt', 'completedAt');
        s.createIndex('taskId', 'taskId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(name, value) {
  const db = await openDB();
  await wrap(store(db, name, 'readwrite').put(value));
  return value;
}

export async function get(name, key) {
  const db = await openDB();
  return wrap(store(db, name, 'readonly').get(key));
}

export async function del(name, key) {
  const db = await openDB();
  return wrap(store(db, name, 'readwrite').delete(key));
}

export async function getAll(name) {
  const db = await openDB();
  return wrap(store(db, name, 'readonly').getAll());
}

export async function clearStore(name) {
  const db = await openDB();
  return wrap(store(db, name, 'readwrite').clear());
}
