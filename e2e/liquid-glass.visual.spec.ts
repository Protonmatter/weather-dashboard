import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-02-18T07:00:00.000Z");
const HASH_SIZE = 8;
const MAX_HASH_DISTANCE = 4;

const BASELINES = {
  phone: { width: 366, height: 2514, dHash: "060f4707331d8003" },
  tablet: { width: 1132, height: 1723, dHash: "07b73730315809a9" },
  cinema: { width: 1680, height: 1145, dHash: "2324555725706d59" },
} as const;

type ScenarioName = keyof typeof BASELINES;

interface DecodedPng {
  width: number;
  height: number;
  bytesPerPixel: number;
  pixels: Buffer;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(png: Buffer): DecodedPng {
  const signature = "89504e470d0a1a0a";
  if (png.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("visual baseline input is not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(
          `unsupported screenshot PNG: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`
        );
      }
      bytesPerPixel = colorType === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || !bytesPerPixel || !idat.length) {
    throw new Error("incomplete screenshot PNG");
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = raw[sourceOffset++];
    const rowOffset = row * stride;
    const previousRowOffset = rowOffset - stride;

    for (let column = 0; column < stride; column += 1) {
      const encoded = raw[sourceOffset++];
      const left = column >= bytesPerPixel ? pixels[rowOffset + column - bytesPerPixel]! : 0;
      const above = row > 0 ? pixels[previousRowOffset + column]! : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[previousRowOffset + column - bytesPerPixel]!
          : 0;

      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);

      pixels[rowOffset + column] = (encoded + predictor) & 0xff;
    }
  }

  return { width, height, bytesPerPixel, pixels };
}

function differenceHash(png: Buffer): { width: number; height: number; hash: string } {
  const { width, height, bytesPerPixel, pixels } = decodePng(png);
  const stride = width * bytesPerPixel;
  let bits = "";

  for (let row = 0; row < HASH_SIZE; row += 1) {
    const y = Math.min(
      height - 1,
      Math.floor(((row + 0.5) * height) / HASH_SIZE)
    );
    const luminance: number[] = [];

    for (let column = 0; column <= HASH_SIZE; column += 1) {
      const x = Math.min(
        width - 1,
        Math.floor(((column + 0.5) * width) / (HASH_SIZE + 1))
      );
      const pixelOffset = y * stride + x * bytesPerPixel;
      const red = pixels[pixelOffset]!;
      const green = pixels[pixelOffset + 1]!;
      const blue = pixels[pixelOffset + 2]!;
      luminance.push(Math.floor((red * 299 + green * 587 + blue * 114) / 1000));
    }

    for (let column = 0; column < HASH_SIZE; column += 1) {
      bits += luminance[column + 1]! > luminance[column]! ? "1" : "0";
    }
  }

  let hash = "";
  for (let index = 0; index < bits.length; index += 4) {
    hash += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return { width, height, hash };
}

function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) throw new Error("visual hashes have different lengths");
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index]!, 16) ^ Number.parseInt(right[index]!, 16);
    while (value) {
      distance += value & 1;
      value >>= 1;
    }
  }
  return distance;
}

async function bootVisualDashboard(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem(
      "wx.location-onboarding.v1",
      JSON.stringify({ version: 1, complete: true })
    );
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
  await page.getByTestId("forecast-overview").waitFor();

  const providerNotice = page
    .getByRole("status")
    .filter({ hasText: "Couldn't reach the forecast service" });
  await expect(providerNotice).toBeVisible({ timeout: 15_000 });
  await providerNotice.evaluate((node) => {
    node.style.display = "none";
  });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      .weather-particles, .scene-storm-flash { display: none !important; }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

const scenarios: ReadonlyArray<{
  name: ScenarioName;
  width: number;
  height: number;
}> = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 1180, height: 820 },
  { name: "cinema", width: 1920, height: 1080 },
];

for (const scenario of scenarios) {
  test(`${scenario.name} Liquid Glass dashboard`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await bootVisualDashboard(page);

    const screenshot = await page.getByTestId("forecast-overview").screenshot({
      animations: "disabled",
      caret: "hide",
    });
    const actual = differenceHash(screenshot);
    const expected = BASELINES[scenario.name];
    const distance = hammingDistance(actual.hash, expected.dHash);

    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      distance > MAX_HASH_DISTANCE
    ) {
      await testInfo.attach(`liquid-glass-${scenario.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });
      await testInfo.attach(`liquid-glass-${scenario.name}-signature.json`, {
        body: Buffer.from(
          JSON.stringify({ expected, actual, distance, maxDistance: MAX_HASH_DISTANCE }, null, 2)
        ),
        contentType: "application/json",
      });
    }

    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);
    expect(distance, `perceptual dHash ${actual.hash}`).toBeLessThanOrEqual(
      MAX_HASH_DISTANCE
    );
  });
}
