// This file provides type declarations for the 'idb' library when imported from a CDN.
// This resolves TypeScript error TS2307: "Cannot find module..." for URL-based imports.

declare module 'https://cdn.jsdelivr.net/npm/idb@7/+esm' {
  // We're using generic 'any' types to keep this simple and focused on resolving the module error,
  // since the application code already uses IDBPDatabase<any>.

  /**
   * A wrapper around an IDBObjectStore.
   */
  // FIX: Removed `extends IDBObjectStore` to prevent type conflicts.
  export interface IDBPObjectStore<DBTypes = any> {
    getAll(): Promise<any[]>;
    getAllKeys(): Promise<any[]>;
  }
  
  /**
   * A wrapper around an IDBDatabase.
   */
  // FIX: Removed `extends IDBDatabase` to prevent conflicts with native event-based types.
  // The `idb` library provides a promise-based wrapper, which is not directly compatible.
  export interface IDBPDatabase<DBTypes = any> {
    get<T = any>(storeName: string, key: any): Promise<T | undefined>;
    put(storeName: string, value: any, key?: any): Promise<any>;
    delete(storeName: string, key: any): Promise<void>;
    clear(storeName: string): Promise<void>;
    transaction(storeNames: string | string[], mode?: IDBTransactionMode): IDBPTransaction<DBTypes>;

    // Properties needed for the `upgrade` callback
    readonly objectStoreNames: DOMStringList;
    createObjectStore(storeName: string, options?: IDBObjectStoreParameters): IDBPObjectStore<DBTypes>;
  }

  /**
   * A wrapper around an IDBTransaction.
   */
  // FIX: Removed `extends IDBTransaction` to prevent type conflicts.
  export interface IDBPTransaction<DBTypes = any> {
    objectStore(name: string): IDBPObjectStore<DBTypes>;
    readonly done: Promise<void>;
  }

  /**
   * Opens a database.
   */
  export function openDB<DBTypes = any>(
    name: string,
    version?: number,
    options?: {
      upgrade?(
        db: IDBPDatabase<DBTypes>,
        oldVersion: number,
        newVersion: number | null,
        transaction: IDBPTransaction<DBTypes>,
      ): void;
    }
  ): Promise<IDBPDatabase<DBTypes>>;
}