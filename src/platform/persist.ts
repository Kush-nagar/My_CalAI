// Ask the browser to treat our storage as persistent (not evicted under pressure).
// Called once after first meaningful use; safe if unsupported or denied.
const FLAG = 'thali.persistRequested';

export async function requestPersistenceOnce(): Promise<boolean | null> {
  try {
    if (localStorage.getItem(FLAG)) return null;
    if (!navigator.storage?.persist) return null;
    localStorage.setItem(FLAG, '1');
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Request persistence on the first user interaction (first tap = first meaningful use). */
export function requestPersistenceOnFirstUse(): void {
  const handler = () => {
    window.removeEventListener('pointerdown', handler, true);
    void requestPersistenceOnce();
  };
  window.addEventListener('pointerdown', handler, true);
}
