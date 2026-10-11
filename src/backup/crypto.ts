// Passphrase encryption for backups. WebCrypto only: PBKDF2-SHA256 key derivation and
// AES-256-GCM authenticated encryption. No custom cryptography, no stored or hardcoded keys.
import { base64ToBytes, bytesToBase64 } from './codec';

export const ENCRYPTED_FORMAT = 'thali-backup-encrypted';
export const ENCRYPTED_FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
/** Accepted range when reading a file, so a hostile file cannot demand a huge KDF cost. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT;
  formatVersion: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase, or the backup file is damaged.');
    this.name = 'WrongPassphraseError';
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Header fields are bound to the ciphertext as additional authenticated data. */
function aad(e: Pick<EncryptedEnvelope, 'format' | 'formatVersion' | 'kdf' | 'cipher'>): Uint8Array {
  const h = {
    format: e.format,
    formatVersion: e.formatVersion,
    kdf: { name: e.kdf.name, hash: e.kdf.hash, iterations: e.kdf.iterations, salt: e.kdf.salt },
    cipher: { name: e.cipher.name, iv: e.cipher.iv },
  };
  return new TextEncoder().encode(JSON.stringify(h));
}

export async function encryptBytes(plain: Uint8Array, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedEnvelope> {
  if (!passphrase) throw new Error('Passphrase required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const head = {
    format: ENCRYPTED_FORMAT,
    formatVersion: ENCRYPTED_FORMAT_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
  } as const;
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(head) as BufferSource },
    key,
    plain as BufferSource,
  );
  return { ...head, ciphertext: bytesToBase64(new Uint8Array(ct)) };
}

/** Structural check of an encrypted envelope. Returns error strings (empty when valid). */
export function checkEnvelope(o: Record<string, unknown>): string[] {
  const errs: string[] = [];
  if (o.formatVersion !== ENCRYPTED_FORMAT_VERSION) {
    errs.push(
      typeof o.formatVersion === 'number' && o.formatVersion > ENCRYPTED_FORMAT_VERSION
        ? 'This encrypted backup was made by a newer version of Thali. Update the app, then try again.'
        : 'Unsupported encrypted backup version.',
    );
    return errs;
  }
  const kdf = o.kdf as Record<string, unknown> | undefined;
  const cipher = o.cipher as Record<string, unknown> | undefined;
  if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') errs.push('Unsupported key derivation settings.');
  else if (!Number.isInteger(kdf.iterations) || (kdf.iterations as number) < MIN_ITERATIONS || (kdf.iterations as number) > MAX_ITERATIONS)
    errs.push('Key derivation iteration count is out of the accepted range.');
  else if (base64ToBytes(kdf.salt as string)?.length !== 16) errs.push('Invalid salt.');
  if (!cipher || cipher.name !== 'AES-GCM' || base64ToBytes(cipher.iv as string)?.length !== 12) errs.push('Unsupported cipher settings.');
  if (typeof o.ciphertext !== 'string' || o.ciphertext.length < 24) errs.push('Missing encrypted content.');
  return errs;
}

/** Decrypt a checked envelope. Throws WrongPassphraseError on authentication failure. */
export async function decryptEnvelope(e: EncryptedEnvelope, passphrase: string): Promise<Uint8Array> {
  const salt = base64ToBytes(e.kdf.salt)!;
  const iv = base64ToBytes(e.cipher.iv)!;
  const ct = base64ToBytes(e.ciphertext);
  if (!ct) throw new Error('Encrypted content is not valid base64.');
  const key = await deriveKey(passphrase, salt, e.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(e) as BufferSource },
      key,
      ct as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}
