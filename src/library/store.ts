import type {SongChart} from './chart';

// Imported songs live only in this browser (IndexedDB): the audio file and its chart.
export type SongRecord = {id: string; title: string; chart: SongChart; best: number; added: number};

const dbName = 'jazztrum', songs = 'songs', audio = 'audio';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(songs, {keyPath: 'id'});
      request.result.createObjectStore(audio);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open storage on this device.'));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => {db.close(); resolve(request.result);};
    tx.onerror = tx.onabort = () => {db.close(); reject(tx.error ?? new Error('Storage failed.'));};
  });
}

export const listSongs = async () => (await run<SongRecord[]>(songs, 'readonly', s => s.getAll())).sort((a, b) => b.added - a.added);
export const getSong = (id: string) => run<SongRecord | undefined>(songs, 'readonly', s => s.get(id));
export const saveSong = (record: SongRecord) => run(songs, 'readwrite', s => s.put(record));
export const saveAudio = (id: string, blob: Blob) => run(audio, 'readwrite', s => s.put(blob, id));
export const getAudio = (id: string) => run<Blob | undefined>(audio, 'readonly', s => s.get(id));
export async function deleteSong(id: string) {
  await run(songs, 'readwrite', s => s.delete(id));
  await run(audio, 'readwrite', s => s.delete(id));
}

export async function askToKeepStorage() {
  try {await navigator.storage?.persist?.();} catch { /* optional */ }
}
