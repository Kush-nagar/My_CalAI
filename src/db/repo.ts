import type { Food, ImageAsset, MealEntry, Recipe } from '../domain/types';
import type { Ledger } from './db';

// Repository: the only place UI touches persistence. Every write is one IDB transaction.

const MAX_NAME = 200;

function assertName(name: string) {
  if (!name.trim() || name.length > MAX_NAME) throw new Error(`Name must be 1–${MAX_NAME} characters`);
}

export async function entriesForDate(db: Ledger, localDate: string): Promise<MealEntry[]> {
  const rows = await db.getAllFromIndex('entries', 'localDate', localDate);
  return rows.sort((a, b) => a.loggedAtUtc.localeCompare(b.loggedAtUtc));
}

export async function entriesInRange(db: Ledger, fromDate: string, toDate: string): Promise<MealEntry[]> {
  return db.getAllFromIndex('entries', 'localDate', IDBKeyRange.bound(fromDate, toDate));
}

export async function putEntry(db: Ledger, e: MealEntry): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.localDate)) throw new Error('Invalid date');
  if (!(e.portion.grams >= 0)) throw new Error('Invalid portion');
  await db.put('entries', e);
}

/** Deleting an entry also deletes its attached photo, if any. */
export async function deleteEntry(db: Ledger, id: string): Promise<void> {
  const tx = db.transaction(['entries', 'images'], 'readwrite');
  const e = await tx.objectStore('entries').get(id);
  if (e?.imageId) await tx.objectStore('images').delete(e.imageId);
  await tx.objectStore('entries').delete(id);
  await tx.done;
}

/** Recent distinct items, newest first, for quick re-logging. */
export async function recentItems(db: Ledger, limit = 20): Promise<MealEntry[]> {
  const all = await db.getAll('entries');
  all.sort((a, b) => b.loggedAtUtc.localeCompare(a.loggedAtUtc));
  const seen = new Set<string>();
  const out: MealEntry[] = [];
  for (const e of all) {
    if (seen.has(e.item.refId)) continue;
    seen.add(e.item.refId);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export async function listCustomFoods(db: Ledger): Promise<Food[]> {
  return db.getAll('foods');
}

export async function putCustomFood(db: Ledger, f: Food): Promise<void> {
  assertName(f.name);
  await db.put('foods', { ...f, updatedAt: new Date().toISOString() });
}

/** Archive rather than delete so the food remains resolvable; diary snapshots are unaffected either way. */
export async function archiveCustomFood(db: Ledger, id: string): Promise<void> {
  const f = await db.get('foods', id);
  if (f) await db.put('foods', { ...f, archived: true, updatedAt: new Date().toISOString() });
}

export async function listRecipes(db: Ledger): Promise<Recipe[]> {
  return db.getAll('recipes');
}

export async function putRecipe(db: Ledger, r: Recipe): Promise<void> {
  assertName(r.name);
  await db.put('recipes', { ...r, updatedAt: new Date().toISOString() });
}

export async function archiveRecipe(db: Ledger, id: string): Promise<void> {
  const r = await db.get('recipes', id);
  if (r) await db.put('recipes', { ...r, archived: true, updatedAt: new Date().toISOString() });
}

export async function getFavorites(db: Ledger): Promise<string[]> {
  return ((await db.get('kv', 'favorites')) as string[] | undefined) ?? [];
}

export async function toggleFavorite(db: Ledger, foodId: string): Promise<string[]> {
  const favs = await getFavorites(db);
  const next = favs.includes(foodId) ? favs.filter((f) => f !== foodId) : [foodId, ...favs];
  await db.put('kv', next, 'favorites');
  return next;
}

export async function putImage(db: Ledger, img: ImageAsset): Promise<void> {
  if (img.blob.size > 15 * 1024 * 1024) throw new Error('Photo too large (max 15 MB)');
  await db.put('images', img);
}

export async function getImage(db: Ledger, id: string): Promise<ImageAsset | undefined> {
  return db.get('images', id);
}

/** Remove photos no longer referenced by any entry. */
export async function deleteOrphanImages(db: Ledger): Promise<number> {
  const tx = db.transaction(['entries', 'images'], 'readwrite');
  const used = new Set((await tx.objectStore('entries').getAll()).map((e) => e.imageId).filter(Boolean));
  let n = 0;
  for (const key of await tx.objectStore('images').getAllKeys()) {
    if (!used.has(key)) {
      await tx.objectStore('images').delete(key);
      n++;
    }
  }
  await tx.done;
  return n;
}

export async function deleteAllPhotos(db: Ledger): Promise<void> {
  const tx = db.transaction(['entries', 'images'], 'readwrite');
  await tx.objectStore('images').clear();
  let cur = await tx.objectStore('entries').openCursor();
  while (cur) {
    if (cur.value.imageId) await cur.update({ ...cur.value, imageId: undefined });
    cur = await cur.continue();
  }
  await tx.done;
}

export async function deleteEverything(db: Ledger): Promise<void> {
  const stores = ['foods', 'recipes', 'entries', 'images', 'kv'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
