# RFC 0003 — Inspection and Drill-Down

| | |
| --- | --- |
| Status | Accepted |
| Author | ProtonMatter |
| Supersedes | — |
| Related | RFC 0001 §5 (presentation targets), RFC 0002 (temperature track) |

## 1. Problem

Every panel is a read-only summary. The hourly strip draws an uncertainty band but will
not tell you the range at 6 PM; the ten-day list compresses each day to two numbers and an
icon; the precipitation fan shows a shape whose values at any given hour are unreadable.
The data to answer all of these is already on the client — the forecast fetch returns 240
hours and the parser keeps 24 — so the gap is interaction, not data.

The app also has no interaction primitives to build on: no hover, focus, or tap-to-inspect
behaviour exists anywhere except the search box.

## 2. Design

### 2.1 Modality parity

Every inspection is reachable three ways: pointer hover, keyboard focus (with arrow keys
where the target is a continuous chart), and tap. RFC 0001 §5 already commits the phone
target to "no hover dependence"; this RFC extends that to a rule — a capability exposed on
hover must be reachable without a hover.

### 2.2 In-flow readouts, not floating tooltips

Inspection results render in a reserved region inside the card, not in a floating tooltip.
Three reasons: the hourly strip lives in an `overflow-x` scroll container that would clip
an absolutely-positioned popup; a fixed region can be an `aria-live` target, so screen
readers hear the same readout pointer users see; and on touch there is no hover to anchor
a tooltip to. The cost is ~2.5rem of reserved vertical space per inspectable card.

### 2.3 Preview on hover, pin on activate

Hover and focus preview an hour; click/Enter pins it. A pinned selection survives pointer
leave and is dismissed by Escape, by activating it again, or by selecting another hour.
Preview-only state reverts on leave. The pinned state is per-card and resets when the
place changes — an hour index is meaningless across locations.

### 2.4 Keep the full hourly axis

`fetchForecast` previously discarded 216 of the 240 fetched hours at parse time. The
parser now keeps every hour from "now" onward and consumers slice what they need: the
strip its 24, the hero its 12, day drill-down its calendar day. Recording is explicitly
capped to the ensemble's 24-hour window at the call site — a 240-hour `validTimes` axis
against 24-hour member rows would archive sixteen phantom zero-member records per real
one.

## 3. Surfaces

| Surface | Inspection |
| --- | --- |
| Hourly strip | Per-hour readout: time, condition, temperature, precip chance, and — live ensemble only — the p10/p50/p90 range. Band gains a column marker at the inspected hour. |
| Ten-day list | Rows expand in place (one at a time) to that day's hourly cells plus UV and sun times, all from data already fetched. |
| Precipitation fan | Pointer/arrow-key scrubbing swaps the quantile row to the inspected hour's per-hour values with an explicit hour label; the fan gains a position rule. |

## 4. Non-goals

- Floating tooltip primitives (§2.2).
- New network requests. Drill-down is a view over data the client already holds; the
  moment a drill-down needs a fetch it is a feature, not an inspection.
- Cross-card linked brushing (inspecting an hour in one card highlighting it in others).
  Plausible follow-up; not this RFC.
