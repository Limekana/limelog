// Theme picker. v1.13 Item 5.
//
// Two themes, one of them a supporter perk. The card exists to make that
// legible without turning the app into a shop: the locked row is visible and
// says why it is locked, once, in one sentence — a perk nobody can see the
// shape of is not a perk, and a perk that nags is worse than no perk.
//
// ── What "locked" does and does not mean ────────────────────────────────
//
// This is a cosmetic perk in an open-source, client-only app. The theme CSS
// ships to everyone and the source is published on F-Droid, so the check here
// is NOT an enforcement boundary and is not pretending to be one — see the
// note at the top of src/lib/entitlement.ts. What it does is switch a
// supporter's perk on by itself, keep working offline, and lapse correctly.
//
// The store re-checks the same condition in `setTheme`, because a `disabled`
// attribute is a UI affordance rather than a check.

import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui';
import { useThemeStore, THEME_IDS, isPaidTheme, type ThemeId } from '@/store/themeStore';
import './ThemeCard.css';

export function ThemeCard() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const entitled = useThemeStore((s) => s.entitled);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <Card padding="md">
      <span className="settings-field__label">{t('settings.theme')}</span>
      <div className="theme-grid">
        {THEME_IDS.map((id: ThemeId) => {
          const locked = isPaidTheme(id) && !entitled;
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              className={`theme-swatch${active ? ' theme-swatch--active' : ''}${locked ? ' theme-swatch--locked' : ''}`}
              onClick={() => setTheme(id)}
              disabled={locked}
              aria-pressed={active}
              // The name alone does not say a row is unavailable, and the
              // lock is drawn rather than written. Screen readers get it here.
              aria-label={locked ? t('settings.themeLockedAria', { name: t(`settings.themeName.${id}`) }) : undefined}
            >
              {/* Real tokens, not a picture of them: each preview is painted
                  by the same CSS the theme ships, so a swatch cannot drift
                  from the thing it is advertising. */}
              <span className={`theme-swatch__preview theme-swatch__preview--${id}`} aria-hidden="true">
                <span className="theme-swatch__preview-bar" />
                <span className="theme-swatch__preview-accent" />
              </span>
              <span className="theme-swatch__name">{t(`settings.themeName.${id}`)}</span>
              {locked && <span className="theme-swatch__lock" aria-hidden="true">🔒</span>}
            </button>
          );
        })}
      </div>
      {/* One sentence, shown only while it is true. It names the Ko-fi link
          that is already further down this screen rather than adding a second
          purchase path. */}
      {!entitled && (
        <div className="settings-field__sublabel settings-ai-note">
          {t('settings.themeSupporterNote')}
        </div>
      )}
    </Card>
  );
}
