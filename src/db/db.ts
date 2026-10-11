import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Food, ImageAsset, MealEntry, Recipe, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

export const DB_NAME = 'thali-ledger';
export const SCHEMA_VERSION = 1;

export interface LedgerDB extends DBSchema {
  /** User custom foods + cached lookups (catalog seed lives in the bundle, not here). */
  foods: { key: string; value: Food; indexes: { barcode: string } };
  recipes: { key: string; value: Recipe };
  entries: { key: string; value: MealEntry; indexes: { localDate: string } };
  images: { key: string; value: ImageAsset };
  kv: { key: string; value: unknown };
}

/**
 * Versioned migrations. IndexedDB runs `upgrade` inside one versionchange
 * transaction, so a failed migration aborts and leaves the previous version intact.
 */
const MIGRATIONS: Record<number, (db: IDBPDatabase<LedgerDB>) => void> = {
  1: (db) => {
    const foods = db.createObjectStore('foods', { keyPath: 'id' });
    foods.createIndex('barcode', 'barcode');
    db.createObjectStore('recipes', { keyPath: 'id' });
    const entries = db.createObjectStore('entries', { keyPath: 'id' });
    entries.createIndex('localDate', 'localDate');
    db.createObjectStore('images', { keyPath: 'id' });
    db.createObjectStore('kv');
  },
};

export function openLedger(name = DB_NAME): Promise<IDBPDatabase<LedgerDB>> {
  return openDB<LedgerDB>(name, SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      for (let v = oldVersion + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v](db);
    },
    blocked() {
      // Another tab holds an older version open.
      console.warn('Database upgrade blocked by another open tab');
    },
  });
}

export type Ledger = IDBPDatabase<LedgerDB>;

export async function getSettings(db: Ledger): Promise<Settings> {
  const s = (await db.get('kv', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(db: Ledger, s: Settings): Promise<void> {
  await db.put('kv', s, 'settings');
}
