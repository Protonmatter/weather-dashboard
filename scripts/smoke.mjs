/** Exercise the built artifact in a real browser, locally or after deployment. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json" };
let server;
let browser;

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--url")) {
    throw new Error("Usage: node scripts/smoke.mjs [--url https://site/path/]");
  }
  let target;
  if (args.length) {
    target = new URL(args[1]);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
      throw new Error("Smoke URL must be HTTP(S) without credentials");
    }
  } else {
    const root = resolve("dist");
    await stat(resolve(root, "index.html"));
    server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        let path = resolve(root, `.${pathname}`);
        if (path !== root && !path.startsWith(root + sep)) {
          res.writeHead(400).end();
          return;
        }
        try {
          if (!(await stat(path)).isFile()) path = resolve(root, "index.html");
        } catch {
          if (extname(path)) { res.writeHead(404).end(); return; }
          path = resolve(root, "index.html");
        }
        const body = await readFile(path);
        res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
        res.end(body);
      } catch { res.writeHead(500).end("smoke server error"); }
    });
    await new Promise((done, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", done);
    });
    target = new URL(`http://127.0.0.1:${server.address().port}/`);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (new URL(response.url()).origin === target.origin &&
        ["script", "stylesheet"].includes(response.request().resourceType()) && !response.ok()) {
      errors.push(`Asset returned HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).origin === target.origin &&
        ["script", "stylesheet"].includes(request.resourceType())) {
      errors.push(`Asset request failed: ${new URL(request.url()).pathname}`);
    }
  });
  // A clean first visit mounts the bundled sample. Boot qualification has no provider dependency.
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.origin === target.origin ? route.continue() : route.abort();
  });
  const response = await page.goto(target.href, { waitUntil: "load", timeout: 15000 });
  if (!response?.ok()) throw new Error(`Document returned HTTP ${response?.status() ?? "unavailable"}`);
  const app = page.getByTestId("weather-app");
  await app.waitFor({ state: "visible", timeout: 8000 });
  if (!(await app.innerText()).trim()) throw new Error("Mounted dashboard has no content");
  if (errors.length) throw new Error(errors.join("; "));
  console.log("smoke: PASS — dashboard visibly mounted; no startup script errors or failed assets");
} catch (error) {
  console.error(`smoke: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}
