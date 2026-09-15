// v1.14 Item 13 — tap-to-stack weight entry.
//
// Named as future work in PR #17's own body, alongside extending the bay to
// WeightUpModal and PRHistory. `PlateBar` has carried an unused `interactive`
// prop and an `onPress` since Cast Iron shipped, with the comment "the entry
// point to tap-to-stack entry". This is the thing it was pointing at.
//
// ── WHY IT IS WORTH A COMPONENT ──────────────────────────────────────────
//
// The set row asks for a number. In a gym, on a phone, with chalk on your
// hands, between sets, a number field is the wrong instrument: you are not
// thinking "102.5", you are thinking "twenty, twenty, ten, and a two-and-a-
// half a side". That second thought is one tap per plate here, and the number
// falls out of it.
//
// ── EVERY TAP IS A PAIR ──────────────────────────────────────────────────
//
// Adding a 20 adds forty kilos, because plates go on both sleeves. Getting
// this wrong in either direction produces a keypad that lies about the bar in
// front of you, so it is stated on the buttons themselves (+40) rather than
// left as arithmetic the user has to redo.
//
// ── SEEDING, AND THE ONE HONEST FAILURE ──────────────────────────────────
//
// The keypad opens on whatever the set already holds, decomposed by
// `solvePlates`. A load that the inventory cannot make exactly — 101 kg, say —
// has no plate stack, so the seed is the nearest one below and the difference
// is shown, not swallowed. The user then sees `101 -> 100` before they commit
// rather than discovering it afterwards.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { PlateBar } from '@/components/PlateBar';
import {
  BAR_WEIGHT, PLATE_INVENTORY, pairLoad, solvePlates, type Unit,
} from '@/utils/plateMath';
import './PlateKeypad.css';

interface Props {
  /** Starting total INCLUDING the bar, in `unit`. */
  initial: number | null;
  unit: Unit;
  /** Called with the new total in `unit`, bar included. */
  onDone: (total: number) => void;
  onClose: () => void;
}

export function PlateKeypad({ initial, unit, onDone, onClose }: Props) {
  const { t } = useTranslation();
  const bar = BAR_WEIGHT[unit];
  const inventory = PLATE_INVENTORY[unit];

  // One entry per plate ON ONE SLEEVE, in tap order. Kept as a list rather
  // than a count map so Undo can remove the last thing the user did rather
  // than the lightest plate, which is what they would expect.
  const [stack, setStack] = useState<number[]>(() => {
    if (initial == null || initial <= bar) return [];
    return solvePlates(initial, unit).plates.map((p) => p.weight);
  });

  const total = bar + pairLoad(stack);
  // Only meaningful on the first render, before the user changes anything —
  // once they have tapped, the comparison is with a number they replaced.
  const [seededFrom] = useState<number | null>(initial);
  const seedLost = useMemo(() => {
    if (seededFrom == null) return 0;
    const seeded = bar + pairLoad(seededFrom <= bar ? [] : solvePlates(seededFrom, unit).plates.map((p) => p.weight));
    return Math.round((seededFrom - seeded) * 100) / 100;
  }, [seededFrom, bar, unit]);

  const add = (w: number) => setStack((s) => [...s, w]);
  const undo = () => setStack((s) => s.slice(0, -1));
  const clear = () => setStack([]);

  return (
    <div className="plate-keypad__overlay" role="dialog" aria-modal="true" aria-label={t('log.plateKeypad')}>
      <div className="plate-keypad">
        <div className="plate-keypad__header">
          <span className="plate-keypad__title">{t('log.plateKeypad')}</span>
          <button className="plate-keypad__close" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        {/* The bay IS the readout. It carries the total as real text and an
            aria-label, so this is not a picture standing in for a number. */}
        <PlateBar total={total} unit={unit} size="lg" />

        {seedLost > 0 && stack.length > 0 && (
          <div className="plate-keypad__note">
            {t('log.plateSeedRounded', { from: seededFrom, to: total, unit: unit.toUpperCase() })}
          </div>
        )}

        <div className="plate-keypad__grid">
          {inventory.map((p) => (
            <button
              key={p.weight}
              type="button"
              className="plate-keypad__plate"
              onClick={() => add(p.weight)}
              // The pair total is on the face of the button because that is
              // what pressing it does. The plate's own weight is the smaller
              // line, because that is what you pick up.
              aria-label={t('log.addPlatePair', { weight: p.weight, unit: unit.toUpperCase() })}
            >
              <span className="plate-keypad__plate-weight">{p.weight}</span>
              <span className="plate-keypad__plate-pair">+{pairLoad([p.weight])}</span>
            </button>
          ))}
        </div>

        <div className="plate-keypad__stack" aria-live="polite">
          {stack.length === 0
            ? <span className="plate-keypad__stack-empty">{t('log.barOnly', { weight: bar, unit: unit.toUpperCase() })}</span>
            : <span className="plate-keypad__stack-list">{stack.join(' · ')}<span className="plate-keypad__stack-side"> {t('log.perSide')}</span></span>}
        </div>

        <div className="plate-keypad__actions">
          <Button variant="secondary" size="sm" onClick={undo} disabled={stack.length === 0}>
            <Undo2 size={14} aria-hidden="true" /> {t('common.undo')}
          </Button>
          <Button variant="secondary" size="sm" onClick={clear} disabled={stack.length === 0}>
            {t('common.clear')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => onDone(total)}>
            {t('log.useWeight', { weight: total, unit: unit.toUpperCase() })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlateKeypad;
