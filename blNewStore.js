/* blNewStore.js — modern, promise-based ES-module IndexedDB store for BLX / BlueShell.
 *
 * BINARY-COMPATIBLE with the classic blStore.js ((C) joembedded.de):
 *   - Database:    'blStore'  (version 1)
 *   - ObjectStore: 'blStore'  (keyPath: 'k')
 *   - Record:      { k: <string>, ts: <ms epoch>, v: <any structured-clonable> }
 * so blxdashboard and BlueShell see exactly the same data.
 *
 * API (all promise-based, no busy-flag polling):
 *   await blNewStore.set(k, v)                 -> undefined   (put/overwrite; ts = Date.now())
 *   await blNewStore.get(k)                    -> v | undefined
 *   await blNewStore.getEntry(k)               -> {k, ts, v} | undefined
 *   await blNewStore.remove(k)                 -> undefined
 *   await blNewStore.list({prefix, filter})    -> [{k, ts, v}]  (filter gets the full entry)
 *   await blNewStore.count()                   -> number
 */
export const blNewStore = (() => {
  'use strict';
  const DB_NAME = 'blStore';
  const DB_STORE = 'blStore';
  let _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const idb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      if (!idb) { reject(new Error("'indexedDB' not supported")); return; }
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
    return _dbPromise;
  }
  function store(db, mode) { return db.transaction(DB_STORE, mode).objectStore(DB_STORE); }
  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB request failed'));
    });
  }

  async function set(k, v) { const db = await openDb(); await wrap(store(db, 'readwrite').put({ k: k, ts: Date.now(), v: v })); }
  async function getEntry(k) { const db = await openDb(); return wrap(store(db, 'readonly').get(k)); }
  async function get(k) { const e = await getEntry(k); return e ? e.v : undefined; }
  async function remove(k) { const db = await openDb(); await wrap(store(db, 'readwrite').delete(k)); }
  async function count() { const db = await openDb(); return wrap(store(db, 'readonly').count()); }

  async function list(opts = {}) {
    const db = await openDb();
    const range = opts.prefix ? IDBKeyRange.bound(opts.prefix, opts.prefix + '￿') : undefined;
    return new Promise((resolve, reject) => {
      const out = [];
      const cur = store(db, 'readonly').openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { resolve(out); return; }
        const entry = c.value;
        try { if (!opts.filter || opts.filter(entry)) out.push(entry); } catch (e) { /* filter errors: skip entry */ }
        c.continue();
      };
      cur.onerror = () => reject(cur.error || new Error('indexedDB cursor failed'));
    });
  }

  return { set, get, getEntry, remove, list, count };
})();
