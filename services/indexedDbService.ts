import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'analytics-builder-db';
const STORE_NAME = 'keyval';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<any>>;

const getDb = (): Promise<IDBPDatabase<any>> => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};

export async function get<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, key);
}

export async function set(key: string, value: any): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, value, key);
}

export async function del(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, key);
}

export async function getAll(): Promise<{ key: any; value: any }[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const keys = await store.getAllKeys();
  const values = await store.getAll();
  await tx.done;
  return keys.map((key, i) => ({ key, value: values[i] }));
}

export async function clear(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}
