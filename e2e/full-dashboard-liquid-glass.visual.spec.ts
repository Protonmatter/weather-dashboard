import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-02-18T07:00:00.000Z");
const HASH_SIZE = 8;
const MAX_HASH_DISTANCE = 4;

const BASELINES = {
  phone: { width: 1, height: 1, dHash: "0000000000000000" },
  tablet: { width: 1, height: 1, dHash: "0000000000000000" },
  cinema: { width: 1, height: 1, dHash: "0000000000000000" },
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
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
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
        throw new Error(`unsupported screenshot PNG: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
      }
      bytesPerPixel = colorType === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = raw[sourceOffset++];
    const rowOffset = row * stride;
    const previousOffset = rowOffset - stride;
    for (let column = 0; column < stride; column += 1) {
      const rawByte = raw[sourceOffset++];
      const left = column >= bytesPerPixel ? pixels[rowOffset + column - bytesPerPixel] : 0;
      const above = row > 0 ? pixels[previousOffset + column] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? pixels[previousOffset + column - bytesPerPixel]
        : 0;
      let value: number;
      if (filter === 0) value = rawByte;
      else if (filter === 1) value = (rawByte + left) & 255;
      else if (filter === 2) value = (rawByte + above) & 255;
      else if (filter === 3) value = (rawByte + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) value = (rawByte + paeth(left, above, upperLeft)) & 255;
      else throw new Error(`unsupported PNG filter ${filter}`);
      pixels[rowOffset + column] = value;
    }
  }

  return { width, height, bytesPerPixel, pixels };
}

function downsampleLuminance(decoded: DecodedPng, width: number, height: number): number[] {
  const result: number[] = [];
  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY0 = Math.floor((targetY * decoded.height) / height);
    const sourceY1 = Math.max(sourceY0 + 1, Math.floor(((targetY + 1) * decoded.height) / height));
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceX0 = Math.floor((targetX * decoded.width) / width);
      const sourceX1 = Math.max(sourceX0 + 1, Math.floor(((targetX + 1) * decoded.width) / width));
      let total = 0;
      let count = 0;
      for (let sourceY = sourceY0; sourceY < sourceY1; sourceY += 1) {
        for (let sourceX = sourceX0; sourceX < sourceX1; sourceX += 1) {
          const pixelOffset = (sourceY * decoded.width + sourceX) * decoded.bytesPerPixel;
          const red = decoded.pixels[pixelOffset];
          const green = decoded.pixels[pixelOffset + 1];
          const blue = decoded.pixels[pixelOffset + 2];
          const alpha = decoded.bytesPerPixel === 4 ? decoded.pixels[pixelOffset + 3] / 255 : 1;
          total += (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha;
          count += 1;
        }
      }
      result.push(total / count);
    }
  }
  return result;
}

function differenceHash(png: Buffer): { width: number; height: number; dHash: string } {
  const decoded = decodePng(png);
  const samples = downsampleLuminance(decoded, HASH_SIZE + 1, HASH_SIZE);
  let bits = 0n;
  let position = 0n;
  for (let y = 0; y < HASH_SIZE; y += 1) {
    for (let x = 0; x < HASH_SIZE; x += 1) {
      const rowOffset = y * (HASH_SIZE + 1);
      if (samples[rowOffset + x] > samples[rowOffset + x + 1]) bits |= 1n << position;
      position += 1n;
    }
  }
  return {
    width: decoded.width,
    height: decoded.height,
    dHash: bits.toString(16).padStart(16, "0"),
  };
}

function hammingDistance(left: string, right: string): number {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

async function setFixedTime(page: Page): Promise<void> {
  await page.addInitScript((timestamp) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(args.length === 0 ? timestamp : args[0]);
      }
      static now(): number { return timestamp; }
    }
    Object.setPrototypeOf(FixedDate, RealDate);
    window.Date = FixedDate as DateConstructor;
  }, FIXED_NOW.getTime());
}

const PROVIDER_PATTERNS = [
  "**/api.open-meteo.com/**",
  "**/air-quality-api.open-meteo.com/**",
  "**/ensemble-api.open-meteo.com/**",
  "**/geocoding-api.open-meteo.com/**",
  "**/api.weather.gov/**",
  "**/mapservices.weather.noaa.gov/**",
  "**/basemap.nationalmap.gov/**",
  "**/tile.openstreetmap.org/**",
] as const;

async function bootFullDashboard(page: Page): Promise<void> {
  await setFixedTime(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("wx.location-onboarding.v1", JSON.stringify({ version: 1, complete: true }));
  });
  for (const pattern of PROVIDER_PATTERNS) {
    await page.route(pattern, (route) => route.abort());
  }
  await page.goto("/");
  await expect(page.getByTestId("forecast-overview")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("weather-metrics")).toBeVisible();
  await page.getByTestId("forecast-map-shell").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("forecast-map-card")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.weather-particles{display:none!important}" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

const SCENARIOS: Record<ScenarioName, { viewport: { width: number; height: number } }> = {
  phone: { viewport: { width: 390, height: 844 } },
  tablet: { viewport: { width: 1180, height: 820 } },
  cinema: { viewport: { width: 1920, height: 1080 } },
};

test.describe.configure({ timeout: 60_000 });

for (const name of Object.keys(SCENARIOS) as ScenarioName[]) {
  test(`full Liquid Glass dashboard baseline: ${name}`, async ({ page }) => {
    const scenario = SCENARIOS[name];
    await page.setViewportSize(scenario.viewport);
    await bootFullDashboard(page);
    const app = page.getByTestId("weather-app");
    await expect(app).toBeVisible();
    const screenshot = await app.screenshot({ animations: "disabled" });
    const signature = differenceHash(screenshot);
    console.info(`full-visual-signature ${name} ${signature.width}x${signature.height} ${signature.dHash}`);
    await test.info().attach(`full-dashboard-${name}.png`, { body: screenshot, contentType: "image/png" });
    expect(signature.width).toBe(BASELINES[name].width);
    expect(signature.height).toBe(BASELINES[name].height);
    expect(hammingDistance(signature.dHash, BASELINES[name].dHash)).toBeLessThanOrEqual(MAX_HASH_DISTANCE);
  });
}
