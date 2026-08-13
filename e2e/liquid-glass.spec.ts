import { expect, test, type Page } from "@playwright/test";

async function bootFallbackDashboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("wx.location-onboarding.v1", JSON.stringify({ version: 1, complete: true }));
  });
  for (const pattern of [
    "**/api.open-meteo.com/**",
    "**/air-quality-api.open-meteo.com/**",
    "**/ensemble-api.open-meteo.com/**",
    "**/mapservices.weather.noaa.gov/**",
    "**/api.rainviewer.com/**",
    "**/tile.openstreetmap.org/**",
  ]) {
    await page.route(pattern, (route) => route.abort());
  }
  await page.goto("/");
  await page.getByTestId("forecast-summary").waitFor();
}

test("exposes scene and glass-mode presentation hooks", async ({ page }) => {
  await bootFallbackDashboard(page);
  const app = page.getByTestId("weather-app");
  await expect(app).toHaveAttribute("data-glass-mode", "auto");
  await expect(app).toHaveAttribute("data-scene", /.+/);
});

test("uses the approved responsive forecast overview", async ({ page }) => {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const expectedTarget = viewport.width <= 767
    ? "phone"
    : viewport.width >= 1600 && viewport.width / viewport.height >= 1.6
      ? "cinema"
      : "tablet";

  await bootFallbackDashboard(page);
  await expect(page.getByTestId("forecast-overview")).toHaveAttribute("data-layout", "responsive-matrix");
  await expect(page.getByTestId("weather-app")).toHaveAttribute("data-target", expectedTarget);
  await expect(page.getByTestId("current-conditions-hero")).toHaveAttribute("data-glass-level", "hero");
  await expect(page.getByTestId("temperature-trend-card")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("renders procedural atmospheric depth behind the glass surfaces", async ({ page }) => {
  await bootFallbackDashboard(page);
  await expect(page.getByTestId("weather-backdrop")).toHaveAttribute("data-day", /day|night/);
  const city = page.getByTestId("scene-city");
  await expect(city).toBeAttached();
  if ((page.viewportSize()?.width ?? 1280) <= 767) {
    await expect(city).toBeHidden();
  } else {
    await expect(city).toBeVisible();
  }
  await expect(page.getByTestId("scene-reflections")).toBeVisible();
  await expect(page.getByTestId("scene-haze")).toBeVisible();
});

test("reduced motion keeps weather context but disables particle animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootFallbackDashboard(page);
  const particle = page.locator(".weather-particles > *").first();
  await expect(particle).toBeVisible();
  expect(await particle.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});

test("glass restyling preserves metric inspection semantics", async ({ page }) => {
  await bootFallbackDashboard(page);
  const humidity = page.getByTestId("weather-metric-humidity");
  await humidity.focus();
  await expect(page.getByRole("tooltip")).toContainText("relative humidity");
  await humidity.press("Enter");
  await expect(page.getByTestId("weather-metric-detail")).toContainText("Relative humidity");
  await humidity.press("Escape");
  await expect(page.getByTestId("weather-metric-detail")).toHaveCount(0);
});

test("map and radar controls retain readable depth and tab semantics", async ({ page }) => {
  await bootFallbackDashboard(page);
  const shell = page.getByTestId("forecast-map-shell");
  await shell.scrollIntoViewIfNeeded();
  const mapCard = page.getByTestId("forecast-map-card");
  await expect(mapCard).toBeVisible({ timeout: 15_000 });
  const mapTokens = await mapCard.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      blur: style.getPropertyValue("--glass-blur").trim(),
      alpha: Number.parseFloat(style.getPropertyValue("--glass-alpha")),
    };
  });
  expect(mapTokens.blur).toBe("20px");
  expect(mapTokens.alpha).toBeCloseTo(0.46, 5);

  const radarTab = page.getByRole("tab", { name: "Radar observations" });
  await expect(radarTab).toBeVisible();
  await expect(radarTab).toBeEnabled();
  const before = await radarTab.evaluate((node) => getComputedStyle(node).backgroundColor);
  await radarTab.dispatchEvent("click");
  await expect(radarTab).toHaveAttribute("aria-selected", "true");
  const after = await radarTab.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(after).not.toBe(before);
  await expect(page.getByTestId("forecast-map-viewport")).toHaveCSS("backdrop-filter", "none");
});

test("solid mode removes blur while keeping an opaque readable surface", async ({ page }) => {
  await bootFallbackDashboard(page);
  await page.getByTestId("weather-app").evaluate((node) => node.setAttribute("data-glass-mode", "solid"));
  const style = await page.getByTestId("current-conditions-hero").evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      backdropFilter: computed.backdropFilter,
      webkitBackdropFilter: (computed as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter,
      backgroundColor: computed.backgroundColor,
    };
  });
  expect(style.backdropFilter === "none" || style.webkitBackdropFilter === "none").toBe(true);
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("remains usable at 320 CSS pixels with long content and 44 px controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await bootFallbackDashboard(page);
  const refresh = page.getByRole("button", { name: "Refresh forecast" });
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const heading = page.getByTestId("current-conditions-hero").getByRole("heading", { level: 1 });
  await heading.evaluate((node) => {
    node.textContent = "A Very Long Weather Location Name Used to Verify Responsive Glass Layout Boundaries";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("forced colors retains visible focus", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "forced-colors emulation is isolated to Chromium");
  await page.emulateMedia({ forcedColors: "active" });
  await bootFallbackDashboard(page);
  const refresh = page.getByRole("button", { name: "Refresh forecast" });
  await refresh.focus();
  await expect(refresh).toBeFocused();
});

test("nested metric insets do not own another backdrop blur", async ({ page }) => {
  await bootFallbackDashboard(page);
  const inset = page.getByTestId("current-conditions-hero").locator(".glass-inset").first();
  const filters = await inset.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backdrop: style.backdropFilter,
      webkit: (style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter,
    };
  });
  for (const filter of [filters.backdrop, filters.webkit]) {
    expect((filter ?? "").toLowerCase()).not.toContain("blur");
  }
});
