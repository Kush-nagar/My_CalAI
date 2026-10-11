import { useState } from 'preact/hooks';
import { deleteAllPhotos, deleteEverything } from '../../db/repo';
import { NUTRIENTS, type AgeBand, type NutrientCode, type Settings as S } from '../../domain/types';
import { ConfirmButton, Segmented, Switch } from '../components';
import { Icon } from '../icons';
import { useApp } from '../store';
import { useUi } from '../ui';
import { BackupPanel } from '../backup/BackupPanel';

export function SafetyNote() {
  return (
    <p class="notice">
      <Icon name="info" size={18} />
      <span>
        Safety mode is on. Thali shows what foods contain and how varied your meals are. It never sets targets, goals or scores. If you have questions about eating, growth or health, a doctor, dietitian or trusted adult can help.
      </span>
    </p>
  );
}

export function Settings() {
  const { state, actions } = useApp();
  const ui = useUi();
  const s = state.settings;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const under18 = s.ageBand === 'under18';

  const set = async (patch: Partial<S>, msg?: string) => {
    try {
      await actions.updateSettings(patch);
      if (msg) ui.announce(msg);
    } catch (e) {
      setErr(`Could not save setting: ${(e as Error).message}`);
    }
  };

  const toggleNutrient = (c: NutrientCode, on: boolean) => {
    const cur = s.summaryNutrients;
    const next = on ? [...cur, c] : cur.filter((x) => x !== c);
    // keep canonical order
    const ordered = NUTRIENTS.map((n) => n.code).filter((x) => next.includes(x));
    if (!ordered.length) return;
    void set({ summaryNutrients: ordered });
  };

  async function wipe() {
    setBusy(true);
    try {
      await deleteEverything(state.db);
      location.hash = '';
      location.reload();
    } catch (e) {
      setErr(`Could not delete: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <section class="screen" aria-labelledby="set-h">
      <header class="page-head"><h1 id="set-h">Settings</h1></header>
      {err ? <p class="error" role="alert"><Icon name="alert" size={16} /> {err}</p> : null}

      <section class="card" aria-labelledby="s-age">
        <h2 id="s-age">About you</h2>
        <Segmented
          name="age"
          legend="Age"
          value={s.ageBand}
          onChange={(v: AgeBand) => void set(v === 'under18' ? { ageBand: v, showCalories: false } : { ageBand: v })}
          options={[{ value: 'under18', label: 'Under 18' }, { value: 'adult', label: '18 or over' }, { value: 'unset', label: 'Prefer not to say' }]}
        />
        {under18 ? <SafetyNote /> : <p class="hint">Under 18 turns on safety mode and hides calories by default.</p>}
      </section>

      <section class="card" aria-labelledby="s-disp">
        <h2 id="s-disp">What you see</h2>
        <Switch
          label="Show calories"
          hint={under18 ? 'Hidden by default in safety mode. You can still choose to show them.' : 'Turn off to hide energy everywhere in the app.'}
          checked={s.showCalories}
          onChange={(v) => void set({ showCalories: v })}
        />
        <fieldset class="check-set">
          <legend>Today summary shows</legend>
          {NUTRIENTS.filter((n) => s.showCalories || n.code !== 'energy_kcal').map((n) => (
            <label key={n.code} class="check">
              <input type="checkbox" checked={s.summaryNutrients.includes(n.code)} onChange={(e) => toggleNutrient(n.code, (e.target as HTMLInputElement).checked)} />
              <span>{n.label}</span>
            </label>
          ))}
          <p class="hint">At least one stays selected.</p>
        </fieldset>
        <Segmented
          name="theme"
          legend="Appearance"
          value={s.theme}
          onChange={(v) => void set({ theme: v })}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        />
      </section>

      <section class="card" aria-labelledby="s-priv">
        <h2 id="s-priv">Privacy</h2>
        <p class="hint">Your diary, recipes, photos and settings stay on this device. There is no account.</p>
        <Switch
          label="Online barcode lookup"
          hint="Off by default. When on, scanning a barcode sends only that barcode number to Open Food Facts. Nothing else leaves your device."
          checked={s.onlineLookup}
          onChange={(v) => void set({ onlineLookup: v })}
        />
        <Switch
          label="Keep meal photos"
          hint="Photos you attach to an entry are saved on this device only, as a memory aid. Photo recognition is not available."
          checked={s.keepPhotos}
          onChange={(v) => void set({ keepPhotos: v })}
        />
        <ConfirmButton
          label="Delete all photos"
          confirmLabel="Delete photos"
          message="Delete every saved photo? Diary entries stay, without their photos."
          onConfirm={async () => {
            await deleteAllPhotos(state.db);
            ui.bump();
            ui.announce('All photos deleted');
          }}
        />
      </section>

      <section class="card" aria-labelledby="s-store">
        <h2 id="s-store">Storage and backup</h2>
        <BackupPanel />
      </section>

      <section class="card danger" aria-labelledby="s-del">
        <h2 id="s-del">Delete all data</h2>
        <p class="hint">Removes your diary, custom foods, recipes, photos and settings from this device. Export a backup first if you might want them back. This cannot be undone.</p>
        <div class="field">
          <label for="del-confirm">Type DELETE to confirm</label>
          <div class="field-row"><input id="del-confirm" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} autocomplete="off" autocapitalize="characters" /></div>
        </div>
        <button type="button" class="btn btn-danger" disabled={typed.trim() !== 'DELETE' || busy} onClick={wipe}>
          <Icon name="trash" size={18} /> {busy ? 'Deleting…' : 'Delete everything'}
        </button>
      </section>

      <section class="card" aria-labelledby="s-about">
        <h2 id="s-about">About Thali</h2>
        <p>A private food journal for Indian home cooking. Entries are calculated from the foods, weights and portions you choose. Values are estimates and can differ from the real food.</p>
        <p><strong>Not medical advice.</strong> Thali does not diagnose, treat or recommend what you should eat. Talk to a doctor or dietitian about health questions.</p>
        <h3>Sources and licences</h3>
        <ul class="bullets">
          <li>USDA FoodData Central, public domain (CC0).</li>
          <li>Open Food Facts product data, ODbL, only when you turn on online lookup.</li>
          <li>Your own foods and recipes, and package labels you type in.</li>
        </ul>
        <p class="hint">Every food shows its source, record ID and licence under “Source and details”. Full licence notes are in the project at docs/LICENSES.md.</p>
      </section>
    </section>
  );
}
