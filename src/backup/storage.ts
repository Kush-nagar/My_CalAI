// Browser storage facts used to explain where data lives and how durable it is (esp. iOS Safari).
// All functions degrade to "unknown" when an API is missing; none of them touch the network.

const nav = (): Navigator | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

/** Ask the browser to keep this site's data under storage pressure. Resolves true if granted. */
export async function requestPersistence(): Promise<boolean> {
  const s = nav()?.storage;
  if (!s?.persist) return false;
  try {
    if (s.persisted && (await s.persisted())) return true;
    return await s.persist();
  } catch {
    return false;
  }
}

/** Whether storage is already marked persistent; null when the browser cannot say. */
export async function isPersisted(): Promise<boolean | null> {
  const s = nav()?.storage;
  if (!s?.persisted) return null;
  try {
    return await s.persisted();
  } catch {
    return null;
  }
}

/** Approximate bytes used and available to this site; null when unsupported. */
export async function estimate(): Promise<{ usage: number; quota: number } | null> {
  const s = nav()?.storage;
  if (!s?.estimate) return null;
  try {
    const r = await s.estimate();
    return { usage: r.usage ?? 0, quota: r.quota ?? 0 };
  } catch {
    return null;
  }
}

/** True when running as an installed Home Screen app (not a Safari tab). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (nav() as Navigator & { standalone?: boolean } | undefined)?.standalone === true;
  const mq = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || mq;
}

/** iPhone/iPad (including iPadOS reporting as Mac). Used only to choose explanatory text. */
export function isAppleMobile(): boolean {
  const n = nav();
  if (!n) return false;
  return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
