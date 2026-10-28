import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// A separate additive store keeps the original v1 Preferences data intact.
// IndexedDB avoids duplicating a growing audio library in web localStorage.
const DATABASE = 'edo_language_studio_protected_library';
const STORE = 'snapshots';
function usesIndexedDB(): boolean {
  return !Capacitor.isNativePlatform() && typeof indexedDB !== 'undefined';
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('Unable to open protected local storage. Existing data is unchanged.'));
    request.onblocked = () => reject(new Error('Close other Edo Studio tabs and retry opening the library.'));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function readLibrarySnapshot(key: string): Promise<string | null> {
  if (!usesIndexedDB()) return (await Preferences.get({ key })).value;
  const db = await database();
  const value = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onabort = () => reject(tx.error || new Error('Unable to read protected local storage.'));
    tx.onerror = () => reject(tx.error || new Error('Unable to read protected local storage.'));
  }).finally(() => db.close());
  // Preserve compatibility with v2 snapshots created before IndexedDB was available.
  return value ?? (await Preferences.get({ key })).value;
}
export async function writeLibrarySnapshot(key: string, value: string): Promise<void> {
  if (!usesIndexedDB()) { await Preferences.set({ key, value }); return; }
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Protected library save was interrupted.'));
    tx.onerror = () => reject(tx.error || new Error('Unable to save protected local storage.'));
  }).finally(() => db.close());
}
