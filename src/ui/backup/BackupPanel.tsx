// Backup, restore and "where your data lives". Everything happens on this device; the only way
// data leaves is a file the user explicitly saves or shares.
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useApp } from '../store';
import { getSettings } from '../../db/db';
import {
  backupFilename,
  commitRestore,
  currentCounts,
  exportArchive,
  validateArchive,
  type Counts,
  type RestoreMode,
  type RestoreResult,
  type RestoreSummary,
  type StagedRestore,
} from '../../backup/archive';
import { estimate, formatBytes, isAppleMobile, isPersisted, isStandalone, requestPersistence } from '../../backup/storage';

const DAY = 86_400_000;
const REMIND_AFTER_DAYS = 7;

// ---- helpers ------------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY));
}

/** Simple, honest hint. Not a guarantee; length matters most. */
export function passphraseHint(p: string): { level: 'none' | 'weak' | 'fair' | 'strong'; text: string } {
  if (!p) return { level: 'none', text: '' };
  const words = p.trim().split(/\s+/).filter((w) => w.length >= 3).length;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 20 || words >= 4 || (p.length >= 14 && classes >= 3)) return { level: 'strong', text: 'Strong.' };
  if (p.length >= 12) return { level: 'fair', text: 'Fair. Longer is better: four or more unrelated words work well.' };
  return { level: 'weak', text: 'Weak. Use at least 12 characters, or four or more unrelated words.' };
}

function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Share sheet (iOS: "Save to Files") when available, otherwise a normal download. */
async function saveFile(file: File, via: 'share' | 'download'): Promise<SaveOutcome> {
  if (via === 'share' && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // Share failed for another reason (e.g. activation expired): fall back to a download.
    }
  }
  download(file, file.name);
  return 'downloaded';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const countsText = (c: Counts) =>
  [
    c.entries && plural(c.entries, 'diary entry', 'diary entries'),
    c.foods && plural(c.foods, 'custom food'),
    c.recipes && plural(c.recipes, 'recipe'),
    c.images && plural(c.images, 'photo'),
  ]
    .filter(Boolean)
    .join(', ') || 'nothing';

const AGE_LABEL: Record<string, string> = { unset: 'not set', under18: 'under 18', adult: '18 or over' };

// ---- file save buttons --------------------------------------------------------------------

function SaveButtons(props: { file: File; onSaved?: (o: SaveOutcome) => void; primary?: boolean }) {
  const shareable = canShareFile(props.file);
  const go = async (via: 'share' | 'download') => {
    const o = await saveFile(props.file, via);
    props.onSaved?.(o);
  };
  return (
    <div class="backup-actions">
      {shareable && (
        <button type="button" class={props.primary ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => go('share')}>
          Save to Files / Share…
        </button>
      )}
      <button type="button" class={shareable || !props.primary ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => go('download')}>
        Download file
      </button>
    </div>
  );
}

// ---- export -------------------------------------------------------------------------------

function ExportSection() {
  const app = useApp();
  const latest = useRef(app);
  latest.current = app;
  const { state } = app;
  const id = useId();

  const [includePhotos, setIncludePhotos] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const last = state.settings.lastBackupAt;
  const days = daysSince(last);
  const hint = passphraseHint(pass);
  const mismatch = encrypt && pass2.length > 0 && pass !== pass2;
  const canCreate = !busy && (!encrypt || (pass.length > 0 && pass === pass2));

  const create = async () => {
    setBusy(true);
    setError('');
    setFile(null);
    setStatus(encrypt ? 'Encrypting your backup… this can take a few seconds.' : 'Preparing your backup…');
    try {
      const blob = await exportArchive(state.db, { includePhotos, passphrase: encrypt ? pass : undefined });
      const f = new File([blob], backupFilename(), { type: 'application/json' });
      setFile(f);
      setStatus(`Backup ready: ${f.name} (${formatBytes(f.size)}). Now save it somewhere safe.`);
    } catch (e) {
      setStatus('');
      setError(`Could not create the backup: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const onSaved = async (o: SaveOutcome) => {
    if (o === 'cancelled') return setStatus('Not saved. You can try again.');
    await latest.current.actions.updateSettings({ lastBackupAt: new Date().toISOString() });
    setStatus(o === 'shared' ? 'Backup shared. Check that it arrived where you chose (e.g. Files or iCloud Drive).' : 'Backup downloaded. Move it somewhere safe, such as iCloud Drive or a computer.');
  };

  return (
    <section class="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Back up</h2>
      <p>
        {last ? (
          <>
            Last backup: {fmtDate(last)}
            {days !== null && ` (${days === 0 ? 'today' : plural(days, 'day') + ' ago'})`}.
          </>
        ) : (
          'No backup saved from this device yet.'
        )}
      </p>
      {(days === null || days > REMIND_AFTER_DAYS) && (
        <p class="muted">
          {last ? 'It has been more than a week. ' : ''}A backup file is the only copy of your journal outside this device, so saving one now and then is worth it.
        </p>
      )}

      <div class="field">
        <label>
          <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos((e.target as HTMLInputElement).checked)} /> Include meal photos
        </label>
        <p class="muted">Photos make the file larger. Without them, only your diary, foods, recipes and settings are saved.</p>
      </div>

      <div class="field">
        <label>
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt((e.target as HTMLInputElement).checked)} /> Protect with a passphrase (recommended)
        </label>
      </div>

      {encrypt ? (
        <>
          <div class="field">
            <label for={`${id}-p1`}>Passphrase</label>
            <input id={`${id}-p1`} type="password" autocomplete="new-password" value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} aria-describedby={`${id}-hint`} />
            <p id={`${id}-hint`} class="muted" aria-live="polite">
              {hint.text}
            </p>
          </div>
          <div class="field">
            <label for={`${id}-p2`}>Repeat passphrase</label>
            <input id={`${id}-p2`} type="password" autocomplete="new-password" value={pass2} onInput={(e) => setPass2((e.target as HTMLInputElement).value)} aria-invalid={mismatch} aria-describedby={`${id}-mm`} />
            <p id={`${id}-mm`} class="muted" aria-live="polite">
              {mismatch ? 'The passphrases do not match.' : ''}
            </p>
          </div>
          <p class="muted">
            If you forget the passphrase, the backup cannot be opened by anyone, including you. There is no reset.
          </p>
        </>
      ) : (
        <p role="note">
          <strong>Not encrypted.</strong> Anyone who gets this file can read your food diary{includePhotos ? ' and see your photos' : ''}. Keep it somewhere private and do not
          send it to others.
        </p>
      )}

      <div class="backup-actions">
        <button type="button" class="btn btn-primary" disabled={!canCreate} onClick={create}>
          {busy ? 'Working…' : 'Create backup file'}
        </button>
      </div>

      {file && <SaveButtons file={file} onSaved={onSaved} primary />}

      <p role="status" aria-live="polite">
        {status}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

// ---- restore ------------------------------------------------------------------------------

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'locked'; file: File; message: string }
  | { kind: 'ready'; summary: RestoreSummary; staged: StagedRestore; passphrase?: string }
  | { kind: 'confirm'; summary: RestoreSummary; staged: StagedRestore; passphrase?: string }
  | { kind: 'restoring' }
  | { kind: 'done'; result: RestoreResult; safety: File | null; safetyEncrypted: boolean }
  | { kind: 'error'; errors: string[] };

function RestoreSection() {
  const app = useApp();
  const latest = useRef(app);
  latest.current = app;
  const { state } = app;
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [unlock, setUnlock] = useState('');
  const [here, setHere] = useState<Counts | null>(null);

  useEffect(() => {
    if (phase.kind === 'ready') currentCounts(state.db).then(setHere, () => setHere(null));
  }, [phase.kind, state.db]);

  const check = async (file: File, passphrase?: string) => {
    setPhase({ kind: 'checking' });
    const r = await validateArchive(file, passphrase).catch((e) => ({ ok: false as const, errors: [`Could not read the file: ${(e as Error)?.message ?? e}`] }));
    if (r.ok) setPhase({ kind: 'ready', summary: r.summary, staged: r.staged, passphrase });
    else if ('needsPassphrase' in r && r.needsPassphrase) setPhase({ kind: 'locked', file, message: passphrase ? r.errors[0] : '' });
    else setPhase({ kind: 'error', errors: r.errors });
  };

  const onPick = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    setUnlock('');
    setMode('merge'); // the non-destructive choice is the default for every new file
    if (f) check(f);
  };

  const reset = () => {
    setPhase({ kind: 'idle' });
    setUnlock('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const commit = async (staged: StagedRestore, passphrase?: string) => {
    setPhase({ kind: 'restoring' });
    try {
      const result = await commitRestore(state.db, staged, mode, { safetyPassphrase: passphrase });
      // Bring in-memory settings and catalog in line with what is now stored.
      await latest.current.actions.updateSettings(await getSettings(state.db));
      await new Promise((r) => setTimeout(r, 0)); // let the provider re-render with fresh actions
      await latest.current.actions.refreshCatalog();
      const safety = result.safetyExport ? new File([result.safetyExport], result.safetyFilename!, { type: 'application/json' }) : null;
      setPhase({ kind: 'done', result, safety, safetyEncrypted: !!passphrase });
    } catch (e) {
      setPhase({ kind: 'error', errors: [`Restore failed and nothing was changed. ${(e as Error)?.message ?? ''}`.trim()] });
    }
  };

  const s = phase.kind === 'ready' || phase.kind === 'confirm' ? phase.summary : null;
  const ageChange = s && mode === 'replace' && s.ageBand && s.ageBand !== state.settings.ageBand;

  return (
    <section class="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Restore</h2>
      <div class="field">
        <label for={`${id}-file`}>Choose a Thali backup file (.json)</label>
        <input
          id={`${id}-file`}
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={onPick}
          disabled={phase.kind === 'checking' || phase.kind === 'restoring'}
        />
        <p class="muted">The file is checked first. Nothing on this device changes until you confirm.</p>
      </div>

      <div role="status" aria-live="polite">
        {phase.kind === 'checking' && <p>Checking the file…</p>}
        {phase.kind === 'restoring' && <p>Restoring… keep this screen open.</p>}
      </div>

      {phase.kind === 'locked' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check(phase.file, unlock);
          }}
        >
          <div class="field">
            <label for={`${id}-unlock`}>This backup is encrypted. Passphrase:</label>
            <input id={`${id}-unlock`} type="password" autocomplete="current-password" value={unlock} onInput={(e) => setUnlock((e.target as HTMLInputElement).value)} />
          </div>
          {phase.message && <p role="alert">{phase.message}</p>}
          <div class="backup-actions">
            <button type="submit" class="btn btn-primary" disabled={!unlock}>
              Unlock
            </button>
            <button type="button" class="btn btn-secondary" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {phase.kind === 'error' && (
        <div role="alert">
          <p>
            <strong>This file cannot be restored.</strong> Your current data is unchanged.
          </p>
          <ul>
            {phase.errors.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <button type="button" class="btn btn-secondary" onClick={reset}>
            Choose another file
          </button>
        </div>
      )}

      {s && (
        <div>
          <h3>What is in this backup</h3>
          <dl>
            <dt>Made on</dt>
            <dd>{fmtDate(s.createdAt)}</dd>
            <dt>Diary</dt>
            <dd>
              {plural(s.entries, 'entry', 'entries')}
              {s.dateRange && ` from ${fmtDate(s.dateRange.from)} to ${fmtDate(s.dateRange.to)}`}
            </dd>
            <dt>Custom foods</dt>
            <dd>{s.foods}</dd>
            <dt>Recipes</dt>
            <dd>{s.recipes}</dd>
            <dt>Photos</dt>
            <dd>{s.includesPhotos ? s.images : 'not included'}</dd>
            <dt>Encrypted</dt>
            <dd>{s.encrypted ? 'Yes' : 'No'}</dd>
          </dl>
          {s.warnings.map((w, i) => (
            <p key={i} class="muted">
              {w}
            </p>
          ))}

          <fieldset class="field" disabled={phase.kind === 'confirm'}>
            <legend>How to restore</legend>
            <label>
              <input type="radio" name={`${id}-mode`} value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge: add what is missing and keep
              everything already on this device
            </label>
            <label>
              <input type="radio" name={`${id}-mode`} value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace: make this device
              match the backup exactly
            </label>
          </fieldset>

          {mode === 'replace' && (
            <p>
              Replace removes what is on this device now{here ? ` (${countsText(here)})` : ''}
              {!s.includesPhotos && ', including all photos, because this backup has none'}. A safety copy of your current data is made first so you can undo by restoring
              it.
            </p>
          )}
          {ageChange && (
            <p>
              Note: this backup's age setting is "{AGE_LABEL[s.ageBand!]}" but this device is set to "{AGE_LABEL[state.settings.ageBand]}". Replacing changes it; you can
              check it in Settings afterwards.
            </p>
          )}

          {phase.kind === 'ready' ? (
            <div class="backup-actions">
              <button type="button" class="btn btn-primary" onClick={() => setPhase({ ...phase, kind: 'confirm' })}>
                {mode === 'replace' ? 'Replace my data…' : 'Merge into my data…'}
              </button>
              <button type="button" class="btn btn-secondary" onClick={reset}>
                Cancel
              </button>
            </div>
          ) : (
            <div role="alertdialog" aria-labelledby={`${id}-confirm`}>
              <p id={`${id}-confirm`}>
                <strong>
                  {mode === 'replace'
                    ? 'Replace everything on this device with this backup?'
                    : 'Add the missing records from this backup? Existing records stay as they are.'}
                </strong>
              </p>
              <div class="backup-actions">
                <button type="button" class="btn btn-primary" onClick={() => phase.kind === 'confirm' && commit(phase.staged, phase.passphrase)}>
                  {mode === 'replace' ? 'Yes, replace' : 'Yes, merge'}
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => phase.kind === 'confirm' && setPhase({ ...phase, kind: 'ready' })}>
                  Go back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase.kind === 'done' && (
        <div role="status">
          <p>
            <strong>Restore complete.</strong> Added {countsText(phase.result.added)}
            {phase.result.mode === 'merge' && phase.result.skipped.entries + phase.result.skipped.foods + phase.result.skipped.recipes + phase.result.skipped.images > 0
              ? `; kept your existing version of ${countsText(phase.result.skipped)}`
              : ''}
            .
          </p>
          {phase.safety && (
            <>
              <p>
                Safety copy of the data that was here before ({formatBytes(phase.safety.size)}).{' '}
                {phase.safetyEncrypted ? 'It uses the same passphrase as the backup you restored.' : 'It is not encrypted; keep it private.'} Save it if you might want to undo.
              </p>
              <SaveButtons file={phase.safety} />
            </>
          )}
          <div class="backup-actions">
            <button type="button" class="btn btn-secondary" onClick={() => location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- storage info -------------------------------------------------------------------------

function StorageSection() {
  const id = useId();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [msg, setMsg] = useState('');
  const standalone = isStandalone();
  const apple = isAppleMobile();

  useEffect(() => {
    isPersisted().then(setPersisted);
    estimate().then(setUsage);
  }, []);

  const ask = async () => {
    const ok = await requestPersistence();
    setPersisted(ok);
    setMsg(ok ? 'The browser agreed to keep this data unless you delete it.' : 'The browser did not agree. This is decided by the browser; backups are the reliable safeguard.');
  };

  return (
    <section class="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Where your data lives</h2>
      <dl>
        <dt>Protected from automatic clean-up</dt>
        <dd>
          {persisted === null ? 'Unknown (this browser does not say)' : persisted ? 'Yes' : 'No'}
          {persisted === false && (
            <>
              {' '}
              <button type="button" class="btn btn-secondary" onClick={ask}>
                Ask the browser to keep it
              </button>
            </>
          )}
        </dd>
        <dt>Space used</dt>
        <dd>{usage ? `${formatBytes(usage.usage)} of about ${formatBytes(usage.quota)} available` : 'Unknown'}</dd>
        <dt>Added to Home Screen</dt>
        <dd>{standalone ? 'Yes (running as an app)' : 'No (running in a browser tab)'}</dd>
      </dl>
      <p role="status" aria-live="polite">
        {msg}
      </p>

      <ul>
        <li>Your journal is stored only in this browser on this device. There is no account and no cloud copy.</li>
        <li>Nothing is uploaded. Backup files only go where you choose to save or share them.</li>
      </ul>
      <h3>{apple ? 'On this iPhone or iPad' : 'On iPhone and iPad (Safari)'}</h3>
      <ul>
        <li>
          If Thali is not added to the Home Screen, Safari may delete its data after about 7 days without use.{' '}
          {!standalone && 'To add it: Share button → Add to Home Screen.'}
        </li>
        <li>Deleting the Home Screen app, or clearing Safari history and website data, erases the journal.</li>
        <li>iCloud backups of your phone do not include it.</li>
        <li>Export a backup regularly and save it to Files or iCloud Drive.</li>
      </ul>
    </section>
  );
}

export function BackupPanel() {
  return (
    <div class="backup-panel">
      <ExportSection />
      <RestoreSection />
      <StorageSection />
    </div>
  );
}
