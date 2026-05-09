import { openDB, type IDBPDatabase } from 'idb';
import type { PersistedRoot } from '../store/useSailingStore';

const DB_NAME = 'start-pwa';
const DB_VERSION = 2;
const STATE_STORE = 'state';
const AUDIO_STORE = 'audio';
const ROOT_KEY = 'root';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE);
        }
      }
    });
  }
  return dbPromise;
}

export async function loadRoot(): Promise<PersistedRoot | null> {
  try {
    const db = await getDb();
    const value = (await db.get(STATE_STORE, ROOT_KEY)) as PersistedRoot | undefined;
    return value ?? null;
  } catch (e) {
    console.warn('persistence load failed', e);
    return null;
  }
}

export async function saveRoot(root: PersistedRoot): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STATE_STORE, root, ROOT_KEY);
  } catch (e) {
    console.warn('persistence save failed', e);
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STATE_STORE, ROOT_KEY);
  } catch (e) {
    console.warn('persistence clear failed', e);
  }
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  try {
    const db = await getDb();
    await db.put(AUDIO_STORE, blob, id);
  } catch (e) {
    console.warn('audio save failed', e);
  }
}

export async function loadAudio(id: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    const value = (await db.get(AUDIO_STORE, id)) as Blob | undefined;
    return value ?? null;
  } catch (e) {
    console.warn('audio load failed', e);
    return null;
  }
}

export async function deleteAudio(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(AUDIO_STORE, id);
  } catch (e) {
    console.warn('audio delete failed', e);
  }
}

export async function clearAudio(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(AUDIO_STORE);
  } catch (e) {
    console.warn('audio clear failed', e);
  }
}
