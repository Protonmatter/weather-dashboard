/**
 * Rendering capability probe. Implements the ADR 0002 decision.
 *
 * WebGPU is deliberately NOT used today — see docs/adr/0002-no-webgpu-yet.md. This probe
 * exists so that decision can be revisited with measurement instead of argument, and so
 * the next visual feature can select a tier without a rewrite.
 */

export type RenderTier = "reduced" | "css" | "webgl2" | "webgpu";

export interface Capability {
  tier: RenderTier;
  webgpu: boolean;
  webgl2: boolean;
  reducedMotion: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number;
}

interface NavigatorWithGpu extends Navigator {
  gpu?: { requestAdapter: () => Promise<unknown> };
  deviceMemory?: number;
}

function hasWebgl2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Reduced motion outranks every capability. A user who has asked the OS for less motion
 * has stated a preference that a fast GPU does not override.
 */
export async function probeCapability(): Promise<Capability> {
  const nav = navigator as NavigatorWithGpu;
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let webgpu = false;
  try {
    if (nav.gpu) webgpu = Boolean(await nav.gpu.requestAdapter());
  } catch {
    webgpu = false;
  }

  const webgl2 = hasWebgl2();

  const tier: RenderTier = reducedMotion ? "reduced" : webgpu ? "webgpu" : webgl2 ? "webgl2" : "css";

  return {
    tier,
    webgpu,
    webgl2,
    reducedMotion,
    deviceMemoryGb: nav.deviceMemory ?? null,
    hardwareConcurrency: nav.hardwareConcurrency || 1,
  };
}
