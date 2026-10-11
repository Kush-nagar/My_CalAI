import type { Food } from '../../domain/types';
import { SourceChip } from '../components';
import { Icon } from '../icons';
import { formatNutrient, stateLabel } from '../helpers';
import { normalize } from '../../domain/search';

/** One catalog row: name, matched alias, state, source chip, optional kcal per 100 g. */
export function FoodRow(props: { food: Food; matched?: string; showKcal: boolean; onClick(): void }) {
  const { food } = props;
  const kcal = food.per100g.energy_kcal?.amount;
  const alias = props.matched && normalize(props.matched) !== normalize(food.name) && food.aliases.includes(props.matched) ? props.matched : null;
  const st = stateLabel(food.state);
  return (
    <li>
      <button type="button" class="row row-btn" onClick={props.onClick}>
        <span class="row-main">
          <span class="row-title">{food.name}</span>
          <span class="row-sub">
            {alias ? <span>also “{alias}”</span> : null}
            {st ? <span>{st}</span> : null}
            <SourceChip source={food.source} />
            {food.archived ? <span class="chip">Archived</span> : null}
          </span>
        </span>
        {props.showKcal ? (
          <span class="row-end">
            {kcal !== null && kcal !== undefined ? (
              <>
                <span class="num strong">{formatNutrient('energy_kcal', kcal).replace(' kcal', '')}</span>
                <span class="small muted">kcal / 100 g</span>
              </>
            ) : (
              <span class="small muted">kcal not reported</span>
            )}
          </span>
        ) : null}
        <Icon name="next" size={18} class="row-chev" />
      </button>
    </li>
  );
}
