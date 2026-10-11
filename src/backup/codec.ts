// Byte helpers for the backup format. Browser + Node 22 globals only (btoa/atob, crypto.subtle).

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Base64-encode bytes in chunks (keeps argument lists and intermediate strings small). */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 3 * 8192; // multiple of 3 so chunk encodings concatenate cleanly
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    let bin = '';
    for (let j = 0; j < sub.length; j += 4096) {
      bin += String.fromCharCode.apply(null, sub.subarray(j, j + 4096) as unknown as number[]);
    }
    parts.push(btoa(bin));
  }
  return parts.join('');
}

/** Strict base64 decode: canonical alphabet, padded, no whitespace. Returns null when malformed. */
export function base64ToBytes(s: string): Uint8Array | null {
  if (typeof s !== 'string' || s.length % 4 !== 0 || !B64_RE.test(s)) return null;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  const CHUNK = 4 * 8192;
  let o = 0;
  try {
    for (let i = 0; i < s.length; i += CHUNK) {
      const bin = atob(s.slice(i, i + CHUNK));
      for (let j = 0; j < bin.length; j++) out[o++] = bin.charCodeAt(j);
    }
  } catch {
    return null;
  }
  return o === out.length ? out : null;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-shape comparison for hex digests (not secret, but avoids accidental type coercion). */
export function sameDigest(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.length === b.length && a.toLowerCase() === b;
}

/** Check that image bytes start with the signature of the declared MIME type. */
export function sniffMatches(mime: string, b: Uint8Array): boolean {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string) => at(i, ...Array.from(s, (c) => c.charCodeAt(0)));
  switch (mime) {
    case 'image/jpeg':
      return at(0, 0xff, 0xd8, 0xff);
    case 'image/png':
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'image/heic':
    case 'image/heif':
      return ascii(4, 'ftyp');
    default:
      return false;
  }
}
