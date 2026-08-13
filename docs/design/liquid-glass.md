# Liquid Glass Design System

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
- **Cinema:** hero spans the upper-left two rows, hourly spans the upper-right, AQI and precipitation sit below it, and the 10-day forecast aligns with wind, UV, sunset, and trend cards.

The application uses `data-target="phone|tablet|cinema"`; it does not sniff user agents.

## Scene behavior

`Backdrop.tsx` derives clear, cloudy, overcast, fog, rain, snow, and storm scenes from current weather. The scene includes deterministic particles, bokeh, haze, skyline geometry, and wet reflections. Reduced-motion mode keeps the weather context but disables animation.

## Accessibility and fallbacks

- Phone controls remain at least 44 px high.
- Focus indicators remain visible in normal and forced-color modes.
- `data-glass-mode="solid"` removes blur and supplies an opaque surface.
- Unsupported `backdrop-filter`, reduced-transparency, increased-contrast, and forced-color modes receive explicit fallbacks.
- Hover is never required; existing keyboard, tap, pin, focus restoration, and error-boundary behavior remains intact.

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
```

The visual project fixes the browser time, locale, timezone, motion preference, provider responses, and animation state. It compares SHA-256 hashes for phone, tablet, and cinema overview captures. A mismatch attaches the actual PNG to the Playwright report.

## Review checklist

- No nested backdrop blur.
- No horizontal overflow at 320 CSS px.
- Controls are at least 44 px on phone.
- Text and boundaries remain readable over clear, rain, snow, fog, and storm scenes.
- Map imagery, legends, and radar remain interpretable.
- Initial and total JavaScript remain under the repository budgets.
- All Chromium, WebKit, iPhone, and Android journeys pass.
