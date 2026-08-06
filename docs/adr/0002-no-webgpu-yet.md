# ADR 0002 — Defer WebGPU; ship a capability probe

**Status:** Accepted · **Date:** 2026-08 · **Context:** RFC 0001 §5.1

## Context

A 16:9 desktop target invites richer motion. WebGPU is the natural reach for that, and was
explicitly raised as an option.

## Decision

Do not adopt WebGPU now. Ship `lib/gpu/capability.ts`, which probes for WebGPU, WebGL2 and
`prefers-reduced-motion`, and expose the result so the next visual feature can select a tier
without a rewrite.

## Rationale

The current scene is CSS gradients, blurred divs, sub-100-element SVG and ~46 animated
spans. Chromium composites this on the GPU already. Measured cost is well inside frame
budget; there is nothing for a compute pipeline to relieve.

Adopting WebGPU today would mean: an adapter-request path, a WebGL2 fallback, a CSS fallback
for reduced-motion and locked-down browsers, and shader code — three extra rendering paths
to test in exchange for no measured improvement. That is complexity spent on the appearance
of sophistication.

## When to revisit

The falsifiable threshold from RFC 0001 §5.1: a particle advection field over the ensemble
wind grid at ≥50k particles and 60fps. Per-particle integration at that count is a genuine
compute workload where WebGPU beats WebGL2 transform-feedback meaningfully.

## Consequences

- No GPU code paths to maintain today.
- The probe means the decision can be revisited with telemetry rather than argument.
- If a reviewer expects WebGPU on sight, this document is the answer: the constraint was
  considered and rejected on measurement, which is the stronger position.
