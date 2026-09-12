# RFC 0003 — Inspection and Drill-Down

| | |
| --- | --- |
| Status | Implemented; time-axis and interaction contracts corrected 2026-09-12 |
| Author | ProtonMatter |
| Supersedes | — |
| Related | RFC 0001 §5 (presentation targets), RFC 0002 (temperature track) |

**Current build:** [Build state and evidence](../BUILD_STATE.md) records the current PR 10
revision and validation. The specification below preserves the original interaction
rationale; the current hourly strip and its ensemble band share one horizontal scroll scale.

## 1. Problem

Before this feature, every panel was a read-only summary. The hourly strip drew an
uncertainty band but would not reveal the range at 6 PM; the ten-day list compressed each
day to two numbers and an icon; the precipitation fan did not expose its hourly values.
The forecast request already returned 240 hours while the parser retained only 24, so
the missing pieces were data retention and interaction rather than another provider call.

The app also lacked reusable hover, focus, or tap-to-inspect primitives outside the search
box. The surfaces below are now implemented; RFC 0005 adds separate metric tooltips.

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
strip its 24, the hero its 12, day drill-down its calendar day. Recording uses the
ensemble's explicit `validTimes`, the 24 hour-ending precipitation endpoints, rather than
the first 24 positions in the point-forecast array. Archived temperature rows match those
endpoints; the visible temperature band matches the strip's instantaneous axis separately.
The displayed accumulation window begins at the next complete provider-hour boundary,
preserving fractional UTC phases. A short or missing member row cannot manufacture extra
zero-valued records: the provider and archive boundaries reject missing values.

The offline illustrative fallback uses the same explicit hour-ending axis to choose its
probabilities; it does not take the first 24 point rows and assign them to later endpoints.
The point rows used for the visible strip and the accumulation rows therefore remain
distinct even when the request arrives partway through an hour. Synthetic output is
labelled and excluded from the corrected v2 verification archive.

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
