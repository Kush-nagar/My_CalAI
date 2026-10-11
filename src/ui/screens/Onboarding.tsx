import { useState } from 'preact/hooks';
import type { AgeBand } from '../../domain/types';
import { Icon, Mark } from '../icons';
import { useApp } from '../store';
import { SafetyNote } from './Settings';

const AGES: { value: AgeBand; label: string; sub: string }[] = [
  { value: 'under18', label: 'Under 18', sub: 'Calories stay hidden and no targets are shown.' },
  { value: 'adult', label: '18 or over', sub: '' },
  { value: 'unset', label: 'Prefer not to say', sub: 'You get the standard view. You can change this later.' },
];

export function Onboarding() {
  const { actions } = useApp();
  const [age, setAge] = useState<AgeBand | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (!age) return;
    setBusy(true);
    try {
      await actions.updateSettings({ ageBand: age, onboarded: true, ...(age === 'under18' ? { showCalories: false } : {}) });
    } catch (e) {
      setErr(`Could not save: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <main class="onboard" id="main">
      <div class="onboard-inner">
        <Mark size={52} />
        <h1>Thali</h1>
        <p class="lede">A private journal for what you eat, built around Indian home food.</p>

        <section class="ob-block" aria-labelledby="ob1">
          <h2 id="ob1"><Icon name="lock" size={20} /> Stays on this device</h2>
          <p>There is no account and no sign-up. Your diary, recipes and photos are stored only on this phone or computer. Nothing is uploaded.</p>
        </section>

        <fieldset class="ob-block ob-age">
          <legend><h2>How old are you?</h2></legend>
          <p class="hint">This only adjusts what the app shows. It stays on this device.</p>
          <div class="radio-cards">
            {AGES.map((a) => (
              <label key={a.value} class={'radio-card' + (age === a.value ? ' on' : '')}>
                <input type="radio" name="age" value={a.value} checked={age === a.value} onChange={() => setAge(a.value)} />
                <span class="rc-label">{a.label}</span>
                {a.sub ? <span class="hint">{a.sub}</span> : null}
              </label>
            ))}
          </div>
          {age === 'under18' ? <SafetyNote /> : null}
        </fieldset>

        <section class="ob-block" aria-labelledby="ob3">
          <h2 id="ob3"><Icon name="plus" size={20} /> Keep it handy, keep it safe</h2>
          <p><strong>iPhone:</strong> open this page in Safari, tap Share, then “Add to Home Screen”.</p>
          <p>Because data lives only here, export a backup now and then from Settings. If you clear browser data without a backup, entries cannot be recovered.</p>
        </section>

        {err ? <p class="error" role="alert"><Icon name="alert" size={16} /> {err}</p> : null}
        <button type="button" class="btn btn-primary btn-block" disabled={!age || busy} onClick={go}>
          {busy ? 'Starting…' : 'Start journal'}
        </button>
        {!age ? <p class="hint center">Choose an option above to continue.</p> : null}
      </div>
    </main>
  );
}
