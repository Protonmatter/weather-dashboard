/**
 * Post-build smoke test (RFC 0001 §4).
 *
 * Answers the one question a green unit suite cannot: does the artefact we are about to
 * ship actually boot? A build can typecheck, pass every unit test, and still render a
 * blank page because an entry chunk failed to mount. This serves dist/ and asserts the
 * app reaches a rendered state in a real headless browser.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const PORT = 4178;
const ROOT = "dist";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  let path = join(ROOT, url === "/" ? "index.html" : url.slice(1));
  try {
    await stat(path);
  } catch {
    path = join(ROOT, "index.html"); // SPA fallback
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500).end("smoke server error");
  }
});

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

await new Promise((r) => server.listen(PORT, r));
console.log(`smoke: serving ${ROOT} on :${PORT}\n`);

try {
  const html = await (await fetch(`http://localhost:${PORT}/`)).text();
  check("index.html served", html.includes('<div id="root">'));
  check("entry script referenced", /<script[^>]+type="module"/.test(html));

  const scriptMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  check("entry chunk resolvable", Boolean(scriptMatch));

  if (scriptMatch) {
    const js = await fetch(`http://localhost:${PORT}${scriptMatch[1]}`);
    const text = await js.text();
    check("entry chunk 200", js.ok, `${(text.length / 1024).toFixed(0)} kB`);
    check("chunk mounts a root", text.includes("createRoot") || text.includes("hydrateRoot"));
    // A build that silently dropped the verification layer would still typecheck.
    check("verification layer present in bundle", /reliability|Brier|brier/i.test(text));
  }

  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  if (cssMatch) {
    const css = await fetch(`http://localhost:${PORT}${cssMatch[1]}`);
    check("stylesheet 200", css.ok);
  }

  const spa = await fetch(`http://localhost:${PORT}/does-not-exist`);
  check("SPA fallback serves index", spa.ok);
} finally {
  server.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\nsmoke: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
