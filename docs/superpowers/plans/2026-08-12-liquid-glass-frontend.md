# Liquid Glass Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task.

**Goal:** Replace the flat translucent presentation with the approved adaptive Liquid Glass interface while preserving all weather, ensemble, verification, map, radar, location, privacy, and deployment behavior.

**Architecture:** Keep acquisition and domain logic unchanged. Implement semantic CSS glass levels, a responsive forecast overview, procedural scene depth, explicit accessibility fallbacks, and deterministic Playwright visual regression. Only top-level surfaces receive backdrop blur.

**Tech Stack:** React 18, TypeScript 5.5, Vite 7, Tailwind CSS 3.4, Vitest 3, Playwright 1.62, GitHub Actions.

## Global constraints

- No new runtime dependency, backend, authentication, analytics, telemetry, remote font, or production photography.
- Preserve provider contracts, forecast semantics, verification mathematics, radar selection, storage keys, and privacy behavior.
- Preserve the 73 kB initial and 96 kB total gzipped JavaScript ceilings.
- Preserve keyboard, pointer, touch, focus-restoration, reduced-motion, lazy-loading, caching, and error-boundary behavior.
- Maintain 44 px phone controls and explicit solid, contrast, transparency, and forced-color fallbacks.
- Keep map and chart data opaque enough to interpret.

## Implementation tasks

- [x] Add semantic `control`, `panel`, `hero`, `overlay`, and `map` glass levels.
- [x] Add token and fallback contract tests.
- [x] Migrate shared cards, search, saved locations, and onboarding.
- [x] Build the phone/tablet/cinema forecast overview matrix.
- [x] Redesign current conditions and add wind/visibility and temperature-trend cards.
- [x] Migrate detail, comparison, loading, error, verification, map, and radar presentation.
- [x] Add deterministic haze, skyline, reflections, and weather-aware depth.
- [x] Preserve metric inspection, map/radar tabs, touch targets, and accessibility fallbacks.
- [x] Add deterministic phone, tablet, and cinema visual hashes.
- [x] Add CI gates for typecheck, unit/regression, dependency/license, build/budget/smoke, visual regression, and four-browser E2E.
- [x] Document design tokens, blur ownership, fallbacks, testing, and rollback boundaries.

## Files of interest

- `src/index.css` — tokens, semantic surfaces, interaction states, fallbacks.
- `src/liquid-glass.css` — responsive matrix, procedural scene depth, map treatment.
- `src/components/ForecastOverview.tsx` — overview composition.
- `src/components/Hero.tsx` and `src/components/OverviewCards.tsx` — flagship cards.
- `e2e/liquid-glass.spec.ts` — structural, responsive, interaction, and accessibility coverage.
- `e2e/liquid-glass.visual.spec.ts` — deterministic visual hashes.
- `docs/design/liquid-glass.md` — reviewer and maintenance contract.

## Rollback

The redesign is presentation-only. Reverting the Liquid Glass commits restores the previous layout without migrating data, storage, providers, or backend state. No storage schema or service contract changed.

## Definition of done

- All required GitHub Actions checks are green.
- Visual hashes match at phone, tablet, and cinema targets.
- Build and smoke tests pass within existing budgets.
- The pull request is ready for review but remains unmerged until explicit authorization.
