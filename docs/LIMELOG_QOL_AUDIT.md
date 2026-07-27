# LimeLog — QoL & Dead Code Audit

**Deep pass, 2026-07-27.** Findings only — nothing here is implemented.

Codebase: 67 TS/TSX files, ~9,550 lines. **Materially cleaner than NCC** — two
dead files against NCC's fourteen, and it already lints at
`--max-warnings 0`, which NCC does not.

The findings that matter are not tidiness. Two are correctness bugs, and one
undercuts the entire v1.8 translation effort.

---

## A. QoL — high value

### A1. 🔴 The workout logger cannot be translated at all

**Eleven components never call `useTranslation`.** They contain roughly **59
distinct user-visible English strings** that have no locale keys and never had
any:

| File | Lines | Strings | What it is |
|---|---|---|---|
| `pages/WorkoutPage.tsx` | 567 | 16 | **the core logging screen** |
| `components/NexusSyncCard.tsx` | 287 | 14 | Nexus sync + sign-in |
| `components/HealthConnect.tsx` | 167 | 8 | steps & calories |
| `components/JumpLogModal.tsx` | 99 | 8 | vertical jump entry |
| `components/DebriefSection.tsx` | 120 | 4 | post-workout AI debrief |
| `components/WeightUpModal.tsx` | 66 | 3 | progression prompt |
| `components/LoadChart.tsx` | 136 | 2 | load trend |
| `components/PRCelebrationModal.tsx` | 44 | 2 | PR celebration |
| `components/OneRMChart.tsx` | 116 | 1 | 1RM trend |
| `components/FatigueRating.tsx` | 31 | 1 | session fatigue |

Strings include `"Add set"`, `"Done"`, `"Back"`, `"Discard workout"`,
`"Current personal record"`, `"New personal record"`, `"Session fatigue"`,
`"Ready to progress"`.

**Why this matters more than it looks.** A Hindi user gets a translated auth
gate, translated onboarding, translated nav and translated program screens —
then opens the screen they will spend 95% of their time in and it is entirely
in English. The translated surface is the shell; the app itself is not.

> **This corrects something I reported earlier in the session.** I verified the
> new locales at "100% coverage", and that was true *as measured* — every key in
> `en.json` has a translation in all ten locales. But coverage was measured
> locale-against-locale, **not UI-against-locale**. `en.json` is itself
> incomplete: the keys for the logging flow were never written, so the screen
> was never translatable in the first place. The 273-key set covers onboarding,
> nav, auth, program, library, body and profile — not the workout loop.

**Fix:** add a `workout.*` / `sync.*` key block (~59 keys) and wire
`useTranslation` into those eleven files, then translate into the ten locales.
This is the single highest-value item in the app.

### A2. 🔴 A 20-rep set fires a PR but never appears on the 1RM chart

There are **two Epley implementations with different guards**:

| | `epley1RM` (`lib/prDetection.ts:15`) | `estimate1RM` (`utils/oneRepMax.ts:30`) |
|---|---|---|
| Formula | `w × (1 + reps/30)` | `w × (1 + reps/30)` |
| Rep cap | **none** | **`MAX_RELIABLE_REPS = 12`**, returns `null` above |

Same maths, different validity rules. PR detection accepts a set at any rep
count; the chart discards anything over 12 reps as unreliable.

So a user who grinds out a high-rep set can be told **"New personal record"**,
then find the Progress screen's Est. 1RM chart does not show it — with no
explanation. Either the cap is right (and PR detection should honour it) or it
is not (and the chart should plot it), but the two should not disagree
silently.

**Fix:** one shared estimator with one rep policy. Small change, removes a
genuine "is this app broken?" moment.

### A3. 🟠 The e1RM chip on Today always says "kg", ignoring the lb setting

`pages/TodayPage.tsx:231`:

```
{' '}Top e1RM · {firstExName}: {Math.round(firstExBest * 10) / 10} kg
```

The unit is hardcoded, and `TodayPage` does not read `unitPreference` at all —
so a user who set pounds in Profile sees a kg-derived number labelled `kg` on
their home screen while every other surface shows lb. The `title` attribute
(`"Best estimated 1RM from your logs"`) is untranslated too.

**Fix:** thread `profile.unitPreference` in and use the existing `formatWeight`.

### A4. 🟠 Workout history dates are hardcoded to `en-GB`

`utils/helpers.ts:23` — `new Date(iso).toLocaleDateString('en-GB', …)`, used on
`ProgressPage` for both workout history and jump-log entries. Every user, in
every language, gets British-English dates ("Mon, 26 Jul").

Notably `TodayPage.tsx:32` already does this correctly with
`i18n.language || 'en'` — so the right pattern exists in the codebase and this
one file just missed it.

Same class, two more sites:
- `utils/notifications.ts:22` — `DAY_NAMES` in English, used in notification text.
- `components/HealthConnect.tsx:151` — `DAY_LABELS = ['M','T','W','T','F','S','S']`,
  English initials on the steps chart.

### A5. 🟡 Two divergent kg↔lb converters

| | `utils/helpers.ts:9` | `types/bodyMetrics.ts:57` |
|---|---|---|
| Constant | `2.2046` | `2.2046226218` |
| Rounding | rounds to 1dp **inside** the conversion | none |

Both also export a `formatWeight`. The `helpers.ts` pair is currently reachable
only through the dead `ExerciseBlock` (see B1), so nothing is visibly wrong
today — but it is a trap: whichever one a new caller happens to import decides
whether numbers round-trip. `lbToKg(kgToLb(x)) !== x` for the helpers version.

**Fix:** delete the `helpers.ts` pair, keep `bodyMetrics.ts` as the single
source.

### A6. 🟡 Destructive actions use native `confirm()` — 5 sites

`TodayPage`, `WorkoutPage`, `BodyMetricsPanel`, `utils/storage.ts`. Same
problem as NCC: on Android WebView this is the OS dialog, so the buttons are in
the OS language rather than the app's and **it renders LTR even in Arabic**.
Discarding a workout in progress is exactly the confirmation you want to be
clear and on-brand.

### A7. 🟡 Movement pattern and equipment are closed enums

`pages/LibraryPage.tsx:10-11` — eight patterns, eight equipment types, fixed.
Custom *exercises* are supported, but a custom exercise still has to be filed
under one of the eight built-in patterns/equipment. Same escape-hatch gap the
StudyDesk assignment-type fix addressed, at lower stakes.

### A8. 🟡 Non-gym workout types (already scoped)

Cross-reference: the v1.8 build plan documents this and the schema answer (no
change needed — `session_type` is free text and NCC does not filter by it). The
blocker is that `SessionLog` requires `sessionTemplateId` + `programId` and no
ad-hoc logging path exists. Not repeated here.

---

## B. Dead code — safe to remove

### B1. `ExerciseBlock` — 3 files, ~13 KB

- `components/ExerciseBlock.tsx` (8.2 KB)
- `components/ExerciseBlock.css` (5.1 KB)
- `components/ExerciseBlock.index.ts` (49 B)

Nothing imports any of them — `WorkoutPage` renders its exercise rows inline.
This is the only meaningful dead weight in the app, and it is also the last
consumer of the duplicate `helpers.ts` converters in A5, so removing it makes
that cleanup trivial.

> Worth flagging honestly: **I edited `ExerciseBlock.css` during the RTL pass
> earlier this session** (`text-align: left` → `start`, `margin-left: auto` →
> `margin-inline-start`). That work was wasted — it styles a component that
> never renders. It does no harm, but the file should go rather than be kept
> because it is now "RTL-correct".

### B2. Unused dependencies

`clsx` and `date-fns` in `dependencies`; `@capacitor/assets` in
`devDependencies`. No source references to any of them. `date-fns` in
particular is a non-trivial bundle entry to be carrying for nothing.

### B3. ~9 unnecessary exports

`lastSessionSets.topWeight`, `oauth.isNative`, `onboarding.getTrainingGoal`,
`outbox.subscribe`, `prDetection.epley1RM`, `utils/notifications.cancelWorkoutReminders`,
`helpers.{kgToLb,lbToKg,todayIso,DAY_NAMES}`, `oneRepMax.estimate1RM`.

Two of these are load-bearing for A2/A5 rather than cosmetic — `epley1RM` is
used internally by `prDetection` and `estimate1RM` internally by
`oneRepMax`, so the exports are redundant, but the *duplication* they reveal is
the actual finding.

Includes three I added this session — `RTL_LANGS`, `isRtl`, `applyDirection` in
`src/i18n/index.ts`. `applyDirection` is called internally; `isRtl` and
`RTL_LANGS` are genuinely unused and should be consumed or dropped.

### B4. Unused exported types

`nexusSync.NexusSetPayload`, `outbox.OutboxItem`, and most of `types/index.ts`
(`Exercise`, `Phase`, `Program`, `SessionLog`, `SetLog`, `UserProfile`, …).
These are the domain model, so wide export is defensible — flagged for
completeness, not action.

---

## C. Process

### C1. 🔴 No secret scanner at all

NCC ships `scripts/check-secrets.mjs` plus a pre-commit hook (both now actually
wired up and CI-enforced as of this session). **LimeLog has neither** — no
`scripts/`, no `.githooks/`, no `.github/workflows`.

SEC-1 applies equally here: `src/lib/supabase.ts:18` carries the production URL
and anon key in a public repo. **Fix:** copy NCC's script, hook and CI workflow
across. It is a file copy plus a `prepare` script; the script takes no
arguments and needs no adaptation.

### C2. 🟠 No CI

No `.github/workflows`. The build gate and the lint gate are both discipline
rather than enforcement. LimeLog is the *better*-disciplined repo — it lints at
`--max-warnings 0`, which is stricter than NCC — so wiring that into CI locks
in a standard that is already being met.

### C3. ✅ Credit where due

`--max-warnings 0` on lint, a clean `tsc` build, only two dead files across
9,500 lines, and `TodayPage` already localises its date correctly. The
dead-code surface here is a fraction of NCC's.

---

## Suggested order

1. **A2** (PR vs chart disagreement) — a correctness bug users can hit today.
2. **A3** (kg/lb on Today) — wrong unit on the home screen, small fix.
3. **C1** (port the secret scanner) — file copy, closes SEC-1 exposure.
4. **A4** (date/day localisation) — three sites, correct pattern already exists.
5. **B1 + B2 + A5** (delete ExerciseBlock, drop `clsx`/`date-fns`, unify converters) — one cleanup.
6. **A1** (translate the workout logger) — biggest win, biggest effort; ~59 keys × 10 locales.
7. **A6, A7, B3** — polish.
