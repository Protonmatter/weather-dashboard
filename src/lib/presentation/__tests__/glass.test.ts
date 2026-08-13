import { describe, expect, it } from "vitest";
import { glassClass, GLASS_LEVELS } from "../glass";

describe("glassClass", () => {
  it("exposes the five approved semantic levels", () => {
    expect(GLASS_LEVELS).toEqual(["control", "panel", "hero", "overlay", "map"]);
  });

  it("composes interaction, selection, and caller classes deterministically", () => {
    expect(glassClass("panel", {
      interactive: true,
      selected: true,
      className: "min-w-0",
    })).toBe("glass-surface glass-surface--panel glass-surface--interactive is-selected min-w-0");
  });

  it("does not add optional state classes by default", () => {
    expect(glassClass("hero")).toBe("glass-surface glass-surface--hero");
  });
});
