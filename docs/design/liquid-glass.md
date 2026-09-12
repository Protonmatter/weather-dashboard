# Liquid Glass Design System

**Current build:** Reviewed against PR 10 on 2026-09-12. [Build state and evidence](../BUILD_STATE.md)
identifies the application revision, regression coverage, and validation limits. The
[README](../../README.md) contains captures of the actual application; the reference below
records design intent and is not a screenshot of a deployed build.

## Purpose

The Weather Dashboard uses an adaptive Liquid Glass presentation to place dense forecast data above a procedural weather scene without changing any provider, forecast, verification, radar, map, privacy, or storage semantics.

The approved visual reference is stored at `docs/assets/liquid-glass-weather-dashboard-reference.png`. It is documentation only; production rendering remains CSS, SVG, canvas, and live application data.

## Surface levels

| Level | Intended use | Blur | Tint alpha | Radius |
| --- | --- | ---: | ---: | ---: |
| `control` | Search, icon buttons, pills, tabs | 12 px | 0.22 | pill |
| `panel` | Forecast and metric cards | 24 px | 0.34 | 24 px |
| `hero` | Current conditions | 32 px | 0.29 | 28 px |
| `overlay` | Onboarding and search results | 36 px | 0.54 | 28 px |
| `map` | Map and radar framing | 20 px | 0.46 | 28 px |

Tokens live in `src/index.css`. Responsive composition and procedural depth live in `src/liquid-glass.css`.

## Blur ownership

Only `.glass-surface` elements own `backdrop-filter`. Nested `.glass-inset` elements use translucent fills and borders without another blur. The map viewport is intentionally opaque and declares `backdrop-filter: none`; glass frames the map rather than obscuring data.

Do not add `filter`, `mix-blend-mode`, masks, reduced opacity, or `will-change` to ancestors of glass surfaces. Those properties can create new compositing or backdrop roots.

## Responsive matrix

- **Phone:** single-column decision order; the procedural skyline is omitted and blur is reduced.
- **Tablet:** hero and hourly rows span two columns; forecast and metric cards form a two-column matrix.
- **Cinema:** hero occupies the left column across the upper two rows, hourly spans the two columns to its right, AQI and precipitation sit below hourly, and the 10-day forecast aligns with wind, UV, sunset, and trend cards.

The application uses `data-target="phone|tablet|cinema"`; it does not sniff user agents.
Phone applies through 767 CSS px; cinema requires at least 1600 CSS px and a 16:10 or wider
aspect ratio. Remaining viewports use the tablet target.

## Scene behavior

`Backdrop.tsx` derives clear, cloudy, overcast, fog, rain, snow, and storm scenes from current weather. The scene includes deterministic particles, bokeh, haze, skyline geometry, and wet reflections. Reduced-motion mode keeps the weather context but disables animation.

## Accessibility and fallbacks

- Phone controls remain at least 44 px high.
- Focus indicators remain visible in normal and forced-color modes.
- `data-glass-mode="solid"` removes blur and supplies an opaque surface.
- Unsupported `backdrop-filter`, reduced-transparency, increased-contrast, and forced-color modes receive explicit fallbacks.
- Hover is never required; existing keyboard, tap, pin, focus restoration, and error-boundary behavior remains intact.

The PR 10 interaction corrections keep the hourly cells and their ensemble band on the same
horizontal scale, retain visible keyboard search selection, trap focus while onboarding is
busy, and dismiss metric previews with Escape. Saved-place persistence failure is shown as
session-only feedback, separately from forecast refresh failures. Missing UV or visibility
renders as unavailable rather than producing advice from a fabricated zero.

Map loading feedback begins when a replacement is scheduled, before its request debounce.
A late canceled transport cannot clear the replacement's busy state or newer Retry control;
a canceled success cannot replace the field or enter the grid cache. These state changes do
not add visual motion or change the design tokens.

## Verification

Run:

```bash
npm run typecheck
npm test
npm run build
npm run size
npm run smoke
npm run visual
npm run e2e
npm run test:tooling
```

The visual project fixes browser time, locale, timezone, motion preference, provider responses, and animation state. It verifies the rendered dimensions and a perceptual difference hash for phone, tablet, and cinema captures with a small Hamming-distance tolerance so harmless PNG encoding or subpixel rasterization drift does not invalidate the design baseline. A mismatch attaches the actual PNG and computed signature to the Playwright report.

The visual checks include overview, full-page dashboard, and precipitation timeline states.
Screenshot examples are presentation evidence, while interactive recovery and late transport
behavior require the functional browser regressions. Current results and remaining limits
are recorded in [build state](../BUILD_STATE.md); this checklist is not a claim that any
particular deployment has completed it.

## Review checklist

- No nested backdrop blur.
- No horizontal overflow at 320 CSS px.
- Controls are at least 44 px on phone.
- Text and boundaries remain readable over clear, rain, snow, fog, and storm scenes.
- Map imagery, legends, and radar remain interpretable.
- Initial and total JavaScript remain under the repository budgets.
- All Chromium, WebKit, iPhone, and Android journeys pass.
