// Data layer. Uses Firestore when firebase-config.js has a config, otherwise localStorage.
// Both expose the same API: data[collection][id], put(), remove(), and change notifications.
import { firebaseConfig } from './firebase-config.js';

export const COLLECTIONS = ['people', 'goals', 'logs', 'dateNights', 'dateIdeas', 'rewards', 'settings'];
export const data = Object.fromEntries(COLLECTIONS.map(c => [c, {}]));
export let mode = 'local';

let impl;

export async function initDb(onChange, onError) {
  impl = firebaseConfig ? await firestoreImpl(onChange, onError) : localImpl(onChange);
  return impl.ready;
}

export function put(col, id, value) {
  return impl.put(col, id, value).catch(err => alert('Could not save: ' + err.message));
}

export function remove(col, id) {
  return impl.remove(col, id).catch(err => alert('Could not delete: ' + err.message));
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, src) {
  const out = { ...target };
  for (const [k, v] of Object.entries(src)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

async function firestoreImpl(onChange, onError) {
  mode = 'firebase';
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const { initializeApp } = await import(base + 'firebase-app.js');
  const { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc } = await import(base + 'firebase-firestore.js');
  const db = getFirestore(initializeApp(firebaseConfig));

  const loaded = new Set();
  const ready = new Promise(resolve => {
    for (const col of COLLECTIONS) {
      onSnapshot(collection(db, col), snap => {
        const next = {};
        snap.forEach(d => { next[d.id] = d.data(); });
        data[col] = next;
        loaded.add(col);
        if (loaded.size === COLLECTIONS.length) resolve();
        onChange(col);
      }, err => onError(err));
    }
  });

  return {
    ready,
    put: (col, id, value) => setDoc(doc(db, col, id), value, { merge: true }),
    remove: (col, id) => deleteDoc(doc(db, col, id)),
  };
}

function localImpl(onChange) {
  const key = col => 'nh:data:' + col;
  const load = col => { data[col] = JSON.parse(localStorage.getItem(key(col)) || '{}'); };
  const save = col => localStorage.setItem(key(col), JSON.stringify(data[col]));
  COLLECTIONS.forEach(load);

  // Other tabs on the same device see changes live, which mimics Firestore sync for testing.
  window.addEventListener('storage', e => {
    const col = COLLECTIONS.find(c => key(c) === e.key);
    if (col) { load(col); onChange(col); }
  });

  return {
    ready: Promise.resolve(),
    put: async (col, id, value) => {
      data[col][id] = deepMerge(data[col][id] || {}, value);
      save(col);
      onChange(col);
    },
    remove: async (col, id) => {
      delete data[col][id];
      save(col);
      onChange(col);
    },
  };
}
