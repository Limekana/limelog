import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Undo2 } from 'lucide-react';
import type { Exercise } from '@/types/program';
import type { InjuryRestriction } from '@/types/user';
import { avoidRestriction, rankSubstitutes, searchExercises } from '@/lib/exerciseSwap';
import './SwapExerciseSheet.css';

interface Props {
  current: Exercise;
  /** Set when `current` is already a swap: offers the way back. */
  programmed: Exercise | null;
  exercises: Exercise[];
  restrictions: InjuryRestriction[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}

/**
 * v1.15 Item 8 — pick a substitute for one exercise in the open workout.
 * Suggestions first (lib/exerciseSwap.ts ranks them); search reaches the rest
 * of the library, including anything the suggestions deliberately left out.
 */
export function SwapExerciseSheet({ current, programmed, exercises, restrictions, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const suggested = useMemo(
    () => rankSubstitutes(current, exercises, restrictions),
    [current, exercises, restrictions],
  );
  const results = useMemo(
    () => searchExercises(query, current, exercises),
    [query, current, exercises],
  );
  const list = query.trim() ? results : suggested;

  return (
    <div className="swap-sheet-backdrop" onClick={onClose}>
      <div
        className="swap-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('log.swapTitle')}
      >
        <div className="swap-sheet__header">
          <div className="swap-sheet__heading">
            <span className="swap-sheet__title">{t('log.swapTitle')}</span>
            <span className="swap-sheet__current">{current.name}</span>
          </div>
          <button className="swap-sheet__close" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>

        <p className="swap-sheet__body">{t('log.swapBody')}</p>

        {programmed && (
          <button type="button" className="swap-sheet__back" onClick={() => onPick(programmed.id)}>
            <Undo2 size={14} aria-hidden="true" />
            <span>{t('log.swapBack', { name: programmed.name })}</span>
          </button>
        )}

        <label className="swap-sheet__search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('log.swapSearch')}
            aria-label={t('log.swapSearch')}
          />
        </label>

        {!query.trim() && suggested.length > 0 && (
          <div className="swap-sheet__label">{t('log.swapSuggested')}</div>
        )}

        <ul className="swap-sheet__list">
          {list.map((ex) => {
            const avoid = avoidRestriction(ex, restrictions);
            return (
              <li key={ex.id}>
                <button type="button" className="swap-sheet__item" onClick={() => onPick(ex.id)}>
                  <span className="swap-sheet__item-name">{ex.name}</span>
                  <span className="swap-sheet__item-meta">
                    {t(`library.pattern.${ex.movementPattern}`)} · {ex.primaryMuscle} · {t(`library.equip.${ex.equipment}`)}
                  </span>
                  {/* Only search can surface one of these. Shown rather than
                      hidden: the user may know better than the flag today. */}
                  {avoid && <span className="swap-sheet__item-flag">{avoid.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {list.length === 0 && <div className="swap-sheet__empty">{t('log.swapNoMatch')}</div>}
      </div>
    </div>
  );
}
