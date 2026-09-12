# README screenshot provenance

These PNG files are direct captures of the running Weather Dashboard production build.
They were captured with Playwright CLI in Chrome 151.0.7922.174 on Windows on September 12,
2026. The app was served by `npm run preview` at `http://127.0.0.1:4173/` from the artifact
identified in [BUILD_STATE.md](../BUILD_STATE.md). Its entry was `index-B05xrsZh.js`, built
from application source at `0a8de45`; the checkout's test/documentation head was `8eb002f`.

The first-visit **Not now** action selected the default Palo Alto forecast. Actual
Open-Meteo point, ensemble, air-quality, and GFS map requests returned HTTP 200, and the UI
identified live Open-Meteo data and 31 GFS ensemble members. No provider responses, weather
values, browser time, labels, or application DOM were replaced for these captures. The
images were copied byte-for-byte from browser screenshots, without image editing.

| Image | Capture time (UTC) | Dimensions | View |
| --- | --- | --- | --- |
| [dashboard-desktop.png](dashboard-desktop.png) | 2026-09-12 19:15:58 | 1920 × 1080 | Desktop viewport at the page top |
| [forecast-map.png](forecast-map.png) | 2026-09-12 19:16:40 | 1680 × 838 | Map card captured from the desktop page, pressure selected, forecast playback paused at the first frame |
| [dashboard-mobile.png](dashboard-mobile.png) | 2026-09-12 19:16:43 | 390 × 844 | Same live session resized to a phone-width viewport |

The map retains visible OpenStreetMap attribution. Its timestamp is the selected forecast
valid time; it is distinct from the wall-clock screenshot time. The phone capture establishes
responsive layout in a desktop browser, not physical iPhone or Android testing. The separate
functional suite covers emulated device projects.

## Image identity

```text
36d5bb24e129226c9668f4ac6e8f2691101b56337c8677e2f062a2b6d523b82a  dashboard-desktop.png
dfcc4a8957aa8f6ac968de615f1345520807aee7cd750b66ab8d64b850a56562  forecast-map.png
3de37160d51b4be4be007a463fc7a954d31c9afa2c8fd61e216a827a91660455  dashboard-mobile.png
```

## Reproduce the views

1. Use the existing npm lockfile: `npm ci`, then `npm run build`.
2. Run `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` and open its URL.
3. Choose **Not now**, keep Palo Alto selected, and wait for **Open-Meteo** freshness and
   live GFS ensemble labels. If providers fail, retain the failure evidence; do not relabel
   sample or synthetic output as a live capture.
4. Set a 1920 × 1080 viewport, return to the top, and capture the desktop view.
5. Scroll to the forecast map, wait for its field and visible base tiles, select **Pressure**,
   pause forecast playback, and use Home on **Forecast valid time** to choose the first frame.
   Capture the complete map card including attribution and time controls.
6. Resize to 390 × 844, return to the top, and capture the phone layout.
7. Inspect each image and update its capture time, dimensions, data status, and hash here.

Weather data and animations change, so reproduction targets the views and provenance,
not identical pixels. These files are not the deterministic E2E visual baselines.

The live session's console recorded an optional `/favicon.ico` 404. The application and
weather/map data loaded; the capture does not claim a console with zero resource errors.
Detailed CLI snapshots and request-status logs remain in the ignored `output/playwright/`
workspace directory and are not distributed with the screenshots.
