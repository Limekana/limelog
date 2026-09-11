import { solvePlates, stackLabel, stackAriaLabel, type PlateSpec, type Unit } from '@/utils/plateMath';
import './PlateBar.css';

type BarSize = 'lg' | 'md' | 'sm';

/** Drawn height of the tallest plate, per size. `lg` is the WorkoutPage bay. */
const SCALE: Record<BarSize, number> = { lg: 1, md: 0.4, sm: 0.26 };

export interface PlateBarProps {
  /** Total load including the bar, in `unit`. */
  total: number;
  unit: Unit;
  size?: BarSize;
  barWeight?: number;
  /** Renders as a button — the entry point to tap-to-stack entry. */
  interactive?: boolean;
  onPress?: () => void;
  /** `lg` only: the stack text + total readout under the bar. */
  showReadout?: boolean;
}

/**
 * The signature element of the Cast Iron theme: a weight drawn as a loaded
 * bar. Plate diameter and thickness are true to the inventory, so 145 kg and
 * 100 kg are visibly different objects rather than two different numbers.
 *
 * Presentational only — no store access. Drawn with divs rather than SVG so it
 * inherits the theme tokens and scales with the type.
 *
 * The bay is never the only representation of a weight: the readout carries
 * the number as real text and the element carries an aria-label with the plain
 * total, so a screen reader gets "145 kilograms loaded" rather than a wall of
 * anonymous divs.
 */
export function PlateBar({
  total,
  unit,
  size = 'lg',
  barWeight,
  interactive = false,
  onPress,
  showReadout = size === 'lg',
}: PlateBarProps) {
  const stack = solvePlates(total, unit, barWeight);
  const k = SCALE[size];
  const labelled = size === 'lg'; // plate numerals are only legible at lg

  const plate = (p: PlateSpec, i: number, side: 'l' | 'r') => (
    <div
      key={`${side}${i}`}
      className="plate-bar__plate"
      style={{ width: `${p.thicknessPx}px`, height: `${Math.round(p.heightPx * k)}px` }}
    >
      {labelled && p.heightPx >= 60 ? p.weight : null}
    </div>
  );

  const inner = (
    <>
      <div className="plate-bar__rail">
        {/* The left sleeve mirrors the right: same array, reversed, so the
            heaviest plate still lands against the collar on both sides. */}
        {stack.plates
          .slice()
          .reverse()
          .map((p, i) => plate(p, i, 'l'))}
        <div className="plate-bar__collar" />
        <div className="plate-bar__sleeve" />
        <div className="plate-bar__collar" />
        {stack.plates.map((p, i) => plate(p, i, 'r'))}
        {stack.remainder > 0 && (
          <div className="plate-bar__tape" aria-hidden="true">
            +{stack.remainder}
          </div>
        )}
      </div>

      {showReadout && (
        <div className="plate-bar__readout">
          <span className="plate-bar__stack">{stackLabel(stack)}</span>
          <span className="plate-bar__total">
            {total}
            <span className="plate-bar__unit">{unit.toUpperCase()}</span>
          </span>
        </div>
      )}
    </>
  );

  const className = `plate-bar plate-bar--${size}${interactive ? ' plate-bar--interactive' : ''}`;

  // Rendered as a real <button> when interactive rather than a div with a
  // click handler, so it is reachable by keyboard and announced as a control.
  return interactive ? (
    <button type="button" className={className} onClick={onPress} aria-label={stackAriaLabel(stack)}>
      {inner}
    </button>
  ) : (
    <div className={className} aria-label={stackAriaLabel(stack)}>
      {inner}
    </div>
  );
}

export default PlateBar;
