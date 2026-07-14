# Workout Tracker — Android (Capacitor + React)

## Overview
Workout Tracker is a gym/workout logging app. React 18 + Vite + Capacitor 8 + Supabase + Zustand + Health Connect integration. Android native wrapper under `android/`.

## Token Efficiency Rules (READ THESE FIRST)
- **Prefer `grep`/`rg` over reading entire files** — search for the function/component first
- **Read only relevant sections** — not the whole file. Use `rg -n "functionName" src/` to find locations
- **Keep tool output minimal** — grep for what matters, don't dump full file contents
- **Don't scan unnecessary directories** — stay in `src/` and `android/app/src/main/` unless a task specifically crosses layers

## Build Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Web build | `npm run build` (tsc + vite) |
| Sync to Android | `npm run cap:sync` (runs build + cap sync) |
| Android build | `cd android && ./gradlew-quiet assembleDebug` |
| Android build (full) | `cd android && ./gradlew assembleDebug` (only if quiet mode hides the issue) |
| Lint | `npm run lint` |

## Project Structure
- `src/` — React frontend (components/, pages/, hooks/, store/, data/, lib/)
- `android/` — Capacitor Android native wrapper (Capacitor 8)
- `public/` — Static assets
- `dist/` — Built web output (gitignored)
- `assets/` — Additional assets

## Code Style
- React 18 with TypeScript (`.tsx` files)
- Zustand for state management
- Supabase for backend
- React Router v6 for navigation
- date-fns for date handling
- lucide-react for icons

## Conventions
- Read `src/` first — only go to `android/` for native plugin or build config issues
- Health Connect integration uses `@devmaxime/capacitor-health-connect`
- Pages live in `src/pages/`, shared components in `src/components/`
- Custom hooks in `src/hooks/`
- Don't read `node_modules/` or `dist/`

## Data Contract (shared Supabase — binding)
- Owns `workout_sessions`, `workout_sets`. PUSH-ONLY for normal operation: LimeLog writes, NCC reads. Local + offline retry queue is the source of truth; never bidirectionally merge remote workout data into local state.
- **Recovery-only exception (v1.7, BUG-6):** on cold start a signed-in user may PULL cloud workouts to reinstate sessions whose id is missing locally (reinstall / new device / lost data). This never overwrites or deletes a local session, and skips ids tombstoned by an intentional discard (`wt_session_tombstones`). It is recovery, not sync — see `src/lib/nexusRecovery.ts`. Reconstruction is best-effort: the cloud lacks `exerciseId` / `programId` / `sessionTemplateId`, so recovered sessions link exercises by name and carry empty template/program refs.
- Schema changes → stop and confirm first (see `D:\emilh\Projects\CLAUDE.md`).
