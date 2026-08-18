import './FatigueRating.css';
import { useTranslation } from 'react-i18next';

interface Props {
  value: number | null;
  onChange: (v: number) => void;
}

export function FatigueRating({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="fatigue">
      <span className="fatigue__label">{t('progress.sessionFatigue')}</span>
      <div className="fatigue__dots">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`fatigue__dot${value === n ? ' fatigue__dot--active' : ''}${value !== null && n <= value ? ' fatigue__dot--filled' : ''}`}
            onClick={() => onChange(n)}
            aria-label={t('progress.fatigueRating', { n })}
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
