// ── v1.12 Theme types ──────────────────────────────────────────────────────
//
// `ThemeId` lives here rather than in `store/themeStore.ts` because the
// storage layer needs it too, and `utils/storage.ts` importing from a store
// would point a dependency edge the wrong way: every other type that file
// consumes comes from `@/types`, and a utils module that reaches up into a
// store is the kind of edge that is easy to add and awkward to unpick later.
//
// A type-only import would have been erased at build time and so would not
// have produced a runtime cycle — but it would still have recorded
// `storage → themeStore → storage` in the module graph, one refactor away from
// becoming a real one. `themeStore.ts` re-exports `ThemeId`, so importing it
// from either place is correct and nothing downstream has to care which.
//
// `lime` is the free theme and is the ABSENCE of a `[data-theme]` override,
// not a value of its own — see `apply()` in the store for why that matters.
export type ThemeId = 'lime' | 'cast-iron';
