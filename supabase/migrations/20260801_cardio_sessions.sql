-- Item 4 — cardio sessions (run / cycle / swim / other).
--
-- APPLIED 2026-08-01 to project hkktorzhaqnfqsnlstda, with sign-off.
--
-- ── What this is for ──────────────────────────────────────────────────────────
--
-- LimeLog's logging model is built around `workout_sessions` plus child
-- `workout_sets` rows carrying exercise / weight / reps. That is a
-- strength-training shape. A run or a swim has no sets and no reps; it has a
-- duration, and sometimes a distance. Tagging a strength session "Run" would
-- leave that data nowhere to go, so cardio needs its own fields and its own
-- lightweight logging flow.
--
-- ── Why these columns and not a new table ─────────────────────────────────────
--
-- A cardio session IS a workout session: same owner, same date, same soft
-- delete, same RLS policy, and NCC's weekly fitness count should include it
-- without knowing anything new. A separate table would have meant a second RLS
-- policy, a second sync path, and a change to NCC's read side. Three nullable
-- columns on the existing table cost none of that.
--
-- Verified before writing this: NCC counts sessions with
-- `sessionsCount: inThisWeek.length` and applies NO filter on child sets
-- (`bucketFitnessByWeek` in crossDomainSignals.ts tracks `totalSetCount`
-- separately). So a cardio session with zero `workout_sets` rows is counted
-- towards the weekly fitness score automatically, and NCC needs no change.
--
-- ── Backward compatibility (P1) ───────────────────────────────────────────────
--
-- Additive only. Every column is nullable with no default, so:
--
--   * Existing rows are untouched — a strength session simply has NULL in all
--     three, which is exactly what "this was not a cardio session" means.
--   * Old app versions still in the wild on F-Droid keep working. They SELECT
--     named columns and never see these, and their INSERTs omit them.
--
-- `session_type` is deliberately left NOT NULL rather than relaxed. The cardio
-- flow writes the activity's display label into it ("Run", "Cycle") alongside
-- the machine-readable `activity_type`. That is mild duplication, chosen on
-- purpose: relaxing a NOT NULL that shipped versions rely on is a riskier
-- change than writing a sensible value, and it means an older LimeLog build —
-- or NCC, which reads `session_type` for display — shows "Run" rather than a
-- blank row it was never designed to render.

alter table public.workout_sessions
  -- Machine-readable discriminator. NULL = a strength session, the pre-v1.9
  -- shape. Deliberately text and not an enum: the client offers a fixed list
  -- today, but adding an activity must not require a migration, and an enum
  -- would make an unknown value from a newer client fail the insert outright.
  add column if not exists activity_type text,

  -- Elapsed time in whole seconds. The unit is in the name because the app
  -- collects minutes and the ambiguity is exactly how unit bugs get shipped.
  add column if not exists duration_seconds integer,

  -- Metres, for the activities where distance is meaningful (run / cycle /
  -- swim) and NULL for the ones where it is not (a basketball game has a
  -- duration but no sensible distance). Metric at rest; the client converts
  -- for display the same way it already does for weight.
  add column if not exists distance_meters integer;

comment on column public.workout_sessions.activity_type is
  'Cardio activity slug (run/cycle/swim/other). NULL = strength session (sets-based).';
comment on column public.workout_sessions.duration_seconds is
  'Elapsed seconds. Set for cardio sessions; NULL for strength sessions.';
comment on column public.workout_sessions.distance_meters is
  'Distance in metres, where meaningful. NULL for strength and for distanceless activities.';

-- Guard rails rather than trust. These are cheap and they stop a client bug
-- from writing a negative duration that would then skew every average built
-- on top of it. NOT VALID is deliberate: it enforces the rule on new and
-- updated rows without scanning the existing table, and every existing row
-- has NULL in these columns anyway, so there is nothing to validate.
alter table public.workout_sessions
  add constraint workout_sessions_duration_nonneg
  check (duration_seconds is null or duration_seconds >= 0) not valid;

alter table public.workout_sessions
  add constraint workout_sessions_distance_nonneg
  check (distance_meters is null or distance_meters >= 0) not valid;

-- RLS is unchanged and still correct: `workout_sessions_owner_all` is
-- `auth.uid() = user_id` FOR ALL, which covers these columns automatically.
-- No new table means no new policy (P2), but re-run get_advisors after this
-- anyway, per the standing rule.
