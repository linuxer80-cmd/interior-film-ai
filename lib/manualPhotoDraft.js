let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('manual-case-drafts', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('files'); request.result.createObjectStore('drafts'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
async function operation(store, key, value, write = false) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, write ? 'readwrite' : 'readonly');
    const request = write ? tx.objectStore(store).put(value, key) : tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || Error('기기 저장공간을 확인해주세요.'));
    tx.onerror = () => reject(tx.error);
  });
}
export const readDraft = key => operation('drafts', key);
export const writeDraft = (key, value) => operation('drafts', key, value, true);
export const readPhoto = key => operation('files', key);
export const writePhoto = (key, file) => operation('files', key, file, true);
