// Persistence. Metadata is small and synchronous, so it lives in localStorage.
// Image blobs do not: localStorage is ~5MB and string-only, and base64 photos
// would exhaust it and trigger the eviction this app is already exposed to.

const KEY = 'studio-ideas-v2';
const DB_NAME = 'studio-ideas';
const DB_STORE = 'images';

export function loadIdeas(){
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveIdeas(ideas){
  localStorage.setItem(KEY, JSON.stringify(ideas));
}

let dbPromise = null;

function db(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;  // Clear on failure so next call retries instead of reusing dead promise
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx(mode, fn){
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(DB_STORE, mode);
    let result;
    fn(t.objectStore(DB_STORE), v => { result = v; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function putImage(id, blob){
  return tx('readwrite', s => { s.put(blob, id); });
}

export function getImage(id){
  return tx('readonly', (s, set) => {
    const req = s.get(id);
    req.onsuccess = () => set(req.result);
  });
}

export function deleteImages(ids){
  return tx('readwrite', s => { ids.forEach(id => s.delete(id)); });
}

// Test support only. Never called by the app.
export function clearImageDb(){
  return tx('readwrite', s => { s.clear(); });
}
