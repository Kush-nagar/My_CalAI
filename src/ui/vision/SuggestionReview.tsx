import { useState } from 'preact/hooks';
import type { Food } from '../../domain/types';
import type { Candidate } from '../../vision/match';
import { SourceChip } from '../components';
import { Icon } from '../icons';

/**
 * "Possible matches" from a photo. Order only, no scores. Nothing is logged here: the chosen foods
 * go to the normal amount screen one by one, and the user confirms each.
 */
export function SuggestionReview(props: {
  photoUrl: string | null;
  candidates: Candidate[];
  unsure: boolean;
  onContinue(foods: Food[]): void;
  onSearch(query: string): void;
  onNotSure(): void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [showAnyway, setShowAnyway] = useState(false);
  const byId = new Map<string, Food>();
  for (const c of props.candidates) for (const f of [...c.own, ...c.foods]) byId.set(f.id, f);
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const list = !props.unsure || showAnyway;

  return (
    <div class="pad stack suggest">
      {props.photoUrl ? (
        <figure class="photo-prev small">
          <img src={props.photoUrl} alt="Your meal photo, shown only on this device" />
        </figure>
      ) : null}

      {props.unsure ? (
        <div class="notice">
          <Icon name="info" size={18} />
          <span>Thali can't tell what this is from the photo. Searching is the quickest way.</span>
        </div>
      ) : (
        <>
          <h3 class="suggest-h">Possible matches</h3>
          <p class="hint">
            Suggested from your photo on this device. Check the name, then choose the amount. Amounts, oil and hidden ingredients
            can't be seen in a photo.
          </p>
        </>
      )}

      {props.unsure && !showAnyway ? (
        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={() => props.onSearch('')}>
            <Icon name="search" size={18} /> Search for the food
          </button>
          <button type="button" class="btn btn-secondary" onClick={() => setShowAnyway(true)}>Show possible matches anyway</button>
        </div>
      ) : null}

      {list ? (
        <div class="stack">
          {props.candidates.map((c, i) => (
            <fieldset key={c.label} class="cand">
              <legend>
                <span class="cand-rank" aria-hidden="true">{i + 1}</span> {c.label}
              </legend>
              {[...c.own, ...c.foods].map((f) => (
                <label key={f.id} class="check cand-food">
                  <input type="checkbox" checked={picked.includes(f.id)} onChange={(e) => toggle(f.id, (e.target as HTMLInputElement).checked)} />
                  <span class="cand-name">
                    <span>{c.own.includes(f) ? `Yours: ${f.name}` : f.name}</span>
                    <SourceChip source={f.source} />
                  </span>
                </label>
              ))}
              {c.search ? (
                <button type="button" class="link" onClick={() => props.onSearch(c.search!)}>
                  {c.foods.length || c.own.length ? 'Something else? ' : 'Not in the food list yet. '}Search “{c.search}”
                </button>
              ) : (
                <button type="button" class="link" onClick={() => props.onSearch(c.label)}>Wrong name? Search “{c.label}”</button>
              )}
            </fieldset>
          ))}
        </div>
      ) : null}

      <div class="form-actions stack">
        {list ? (
          <button
            type="button"
            class="btn btn-primary btn-block"
            disabled={picked.length === 0}
            onClick={() => props.onContinue(picked.map((id) => byId.get(id)!).filter(Boolean))}
          >
            {picked.length === 0 ? 'Choose the foods you see' : `Next: choose amount${picked.length > 1 ? `s for ${picked.length} foods` : ''}`}
          </button>
        ) : null}
        <div class="btn-row">
          <button type="button" class="btn btn-secondary" onClick={() => props.onSearch('')}>None of these: search</button>
          <button type="button" class="btn btn-secondary" onClick={props.onNotSure}>I'm not sure</button>
        </div>
      </div>
    </div>
  );
}
