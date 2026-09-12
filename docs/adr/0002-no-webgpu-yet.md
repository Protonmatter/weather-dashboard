# ADR 0002 — Defer WebGPU; ship a capability probe

**Status:** Accepted · **Date:** 2026-08 · **Context:** RFC 0001 §5.1

**Implementation reviewed:** 2026-09-12. See [build state](../BUILD_STATE.md) for the PR 10
revision and verification evidence. Its cancellation and numerical corrections do not add
a WebGPU rendering path.

## Context

A 16:9 desktop target invites richer motion. WebGPU is the natural reach for that, and was
explicitly raised as an option.

## Decision

Do not adopt WebGPU now. Keep `src/lib/gpu/capability.ts`, which can probe WebGPU, WebGL2
and `prefers-reduced-motion`, as a future integration helper. There is currently no caller
in the application, so it neither selects the active renderer nor collects telemetry.

## Rationale

The current scene uses CSS gradients, blurred surfaces, SVG and at most 96 deterministic
rain/snow particles. The map separately renders fields with Canvas 2D and bounds wind
particles to 72 on phones, 120 on tablets and 180 in cinema mode. The browser handles CSS
compositing; the repository does not contain a current cross-device frame-time benchmark
that establishes a performance benefit from WebGPU for this workload.

Adopting WebGPU today would mean: an adapter-request path, a WebGL2 fallback, a CSS fallback
for reduced-motion and locked-down browsers, and shader code — three extra rendering paths
to test without a demonstrated improvement. The existing renderers remain the supported paths.

## When to revisit

The falsifiable threshold from RFC 0001 §5.1: a particle advection field over the ensemble
wind grid at ≥50k particles and 60fps. This is a proposed profiling workload, not a measured
crossover point. Adoption would require reproducible frame-time and power measurements
on the target devices, plus validation of reduced-motion and unsupported-browser behavior.

## Consequences

- No application WebGPU or WebGL rendering paths to maintain today; CSS/SVG and Canvas 2D
  remain in use.
- The unused helper can support an explicitly scoped future capability experiment without
  adding telemetry to the current application.
- Revisit this decision with measured evidence if rendering requirements outgrow the
  current bounded workload.
