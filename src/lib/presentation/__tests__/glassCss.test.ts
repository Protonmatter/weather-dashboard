import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../index.css", import.meta.url), "utf8");

describe("Liquid Glass CSS contract", () => {
  it("defines every semantic level and the approved panel values", () => {
    for (const level of ["control", "panel", "hero", "overlay", "map"]) {
      expect(css).toContain(`.glass-surface--${level}`);
    }
    expect(css).toContain("--glass-panel-blur: 24px");
    expect(css).toContain("--glass-panel-alpha: 0.34");
    expect(css).toContain("--glass-hero-blur: 32px");
    expect(css).toContain(".glass-control");
  });

  it("contains explicit solid, unsupported-filter, forced-color, and transparency fallbacks", () => {
    expect(css).toContain('[data-glass-mode="solid"] .glass-surface');
    expect(css).toContain("@supports not");
    expect(css).toContain("prefers-reduced-transparency");
    expect(css).toContain("forced-colors: active");
  });

  it("does not promote glass surfaces with will-change or nested filter declarations", () => {
    const surfaceBlock = css.slice(css.indexOf(".glass-surface {"), css.indexOf(".glass-surface::before"));
    expect(surfaceBlock).not.toContain("will-change");
    expect(surfaceBlock).not.toMatch(/(^|[;\n]\s*)filter\s*:/m);
  });
});
