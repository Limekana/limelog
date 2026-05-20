import './FatigueRating.css';

interface Props {
  value: number | null;
  onChange: (v: number) => void;
}

export function FatigueRating({ value, onChange }: Props) {
  return (
    <div className="fatigue">
      <span className="fatigue__label">Session fatigue</span>
      <div className="fatigue__dots">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`fatigue__dot${value === n ? ' fatigue__dot--active' : ''}${value !== null && n <= value ? ' fatigue__dot--filled' : ''}`}
            onClick={() => onChange(n)}
            aria-label={`Fatigue ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== null && (
        <span className="fatigue__hint">
          {value <= 4 ? 'Feeling fresh' : value <= 6 ? 'Moderate effort' : value <= 8 ? 'Hard session' : 'Very high fatigue'}
        </span>
      )}
    </div>
  );
}
