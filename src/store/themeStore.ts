import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { isEntitled, refreshEntitlement } from '@/lib/entitlement';

export type ThemeId = 'lime' | 'cast-iron';

/** Free tier. Anything not listed here needs an entitlement. */
const FREE_THEMES: ThemeId[] = ['lime'];

export const THEME_IDS: ThemeId[] = ['lime', 'cast-iron'];

export function isPaidTheme(theme: ThemeId): boolean {
  return !FREE_THEMES.includes(theme);
}

/**
 * The free theme is the ABSENCE of an override, not an override of its own:
 * with `[data-theme]` unset the app must render byte-identically to `main`,
 * and that is the paid theme's regression gate. So `lime` removes the
 * attribute rather than setting a third value.
 */
function apply(theme: ThemeId): void {
  const el = document.documentElement;
  if (theme === 'lime') delete el.dataset.theme;
  else el.dataset.theme = theme;
}

interface ThemeState {
  theme: ThemeId;
  /** True when the user holds a current supporter entitlement. */
  entitled: boolean;
  setTheme: (theme: ThemeId) => void;
  setEntitled: (entitled: boolean) => void;
  /** Re-read entitlement from the server and re-resolve the theme. */
  syncEntitlement: (userId: string | null | undefined) => Promise<void>;
}

/**
 * Reads the stored theme and applies it to <html>. Call from `src/main.tsx`
 * BEFORE ReactDOM.render — doing it in an effect paints lime for a frame and
 * then flips, which is very visible on a cold Android start.
 *
 * Entitlement comes from the local cache here, deliberately: this pass has to
 * be synchronous, and the cache is what the previous session's server check
 * left behind. The store re-checks against the server once auth resolves.
 */
export function bootstrapTheme(): ThemeId {
  let stored: ThemeId = 'lime';
  try {
    const raw = storage.getTheme();
    if (raw === 'cast-iron' || raw === 'lime') stored = raw;
  } catch {
    /* storage unavailable — the free theme is the right fallback */
  }
  const theme = !isPaidTheme(stored) || isEntitled() ? stored : 'lime';
  apply(theme);
  return theme;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (document.documentElement.dataset.theme as ThemeId) ?? 'lime',
  entitled: isEntitled(),

  setTheme: (theme) => {
    // Checked here as well as by the picker's `disabled` attribute, because a
    // disabled attribute is a UI affordance and not a check.
    if (isPaidTheme(theme) && !get().entitled) return;
    apply(theme);
    try {
      storage.setTheme(theme);
    } catch {
      /* the choice just won't survive a relaunch */
    }
    set({ theme });
  },

  setEntitled: (entitled) => {
    set({ entitled });
    // Losing entitlement (a lapse, a refund, a reinstall on a fresh account)
    // must not leave the app sitting in a paid theme.
    if (!entitled && isPaidTheme(get().theme)) {
      apply('lime');
      try {
        storage.setTheme('lime');
      } catch {
        /* nothing to do — the applied theme is already correct */
      }
      set({ theme: 'lime' });
    }
  },

  syncEntitlement: async (userId) => {
    const ok = await refreshEntitlement(userId);
    get().setEntitled(ok);
  },
}));
