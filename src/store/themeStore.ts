import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { isEntitled, refreshEntitlement } from '@/lib/entitlement';
import type { ThemeId } from '@/types/theme';

// Re-exported so `ThemeId` stays importable from the store, which is where a
// theme-aware component would look for it first. The declaration moved to
// `@/types/theme` so `utils/storage.ts` can read it without importing a store;
// see that file for why the direction of that edge matters.
export type { ThemeId };

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
  applyChrome();
}

/**
 * Repoint the `theme-color` meta at whatever `--bg-base` now resolves to.
 *
 * Android tints the system bars from this. It was a hardcoded `#0d0f11` in
 * index.html — the free theme's base — so without this Cast Iron would paint
 * the whole app warm and leave a cold near-black strip along the top of the
 * screen, which reads as a rendering bug rather than a theme.
 *
 * Read from the cascade rather than a table in this file: the value then
 * comes from whichever stylesheet actually won, and a theme that changes its
 * base colour needs no edit here.
 */
function applyChrome(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
  if (bg) meta.setAttribute('content', bg);
}

interface ThemeState {
  theme: ThemeId;
  /** True when the user holds a current supporter entitlement. */
  entitled: boolean;
  setTheme: (theme: ThemeId) => void;
  setEntitled: (entitled: boolean) => void;
  /** Re-read entitlement from the server and re-resolve the theme. */
  syncEntitlement: (
    userId: string | null | undefined,
    opts?: { force?: boolean },
  ) => Promise<void>;
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

  // `force` skips the six-hour cache. The caller that needs it is sign-in: a
  // supporter who was signed out moments ago has a fresh "not entitled"
  // answer cached, and serving that would hide the perk they just paid for
  // until the cache aged out.
  syncEntitlement: async (userId, opts) => {
    const ok = await refreshEntitlement(userId, opts);
    get().setEntitled(ok);
  },
}));
