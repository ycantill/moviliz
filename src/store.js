// Guarda la base de rutas en IndexedDB para usarla sin conexión.
const DB = 'moviliz';
const STORE = 'datos';
const KEY = 'transmetro';
const URL_DATOS = 'data/transmetro.json';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch { return null; }
}
async function idbPut(value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* sin IndexedDB: la app sigue funcionando con la red o la caché */ }
}

// Usa la copia local al instante y, si hay internet, la actualiza en segundo plano.
export async function loadData() {
  const local = await idbGet();
  const fetchFresh = async () => {
    const res = await fetch(URL_DATOS, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!local || local.generado !== data.generado || local.version !== data.version) await idbPut(data);
    return data;
  };
  if (local) {
    if (navigator.onLine) fetchFresh().catch(() => {});
    return { data: local, origen: 'local' };
  }
  return { data: await fetchFresh(), origen: 'red' };
}
