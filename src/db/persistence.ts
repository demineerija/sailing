import { openDB, type IDBPDatabase } from 'idb';
import type { PersistedRoot } from '../store/useSailingStore';

const DB_NAME = 'start-pwa';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'root';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      }
    });
  }
  return dbPromise;
}

export async function loadRoot(): Promise<PersistedRoot | null> {
  try {
    const db = await getDb();
    const value = (await db.get(STORE, KEY)) as PersistedRoot | undefined;
    return value ?? null;
  } catch (e) {
    console.warn('persistence load failed', e);
    return null;
  }
}

export async function saveRoot(root: PersistedRoot): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, root, KEY);
  } catch (e) {
    console.warn('persistence save failed', e);
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE, KEY);
  } catch (e) {
    console.warn('persistence clear failed', e);
  }
}
