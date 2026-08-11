/**
 * Bundle size budget. Fails CI when the gzipped JS crosses the ceiling, so a careless
 * dependency shows up in review rather than in someone's page load.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const INITIAL_BUDGET_KB = 73;
const TOTAL_BUDGET_KB = 96;
const dir = "dist/assets";

const manifest = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8"));
const entry = Object.values(manifest).find((item) => item.isEntry);
if (!entry) {
  console.error("FAIL: Vite manifest has no entry chunk");
  process.exit(1);
}

const initialFiles = new Set();
function collectInitial(item) {
  if (!item || initialFiles.has(item.file)) return;
  initialFiles.add(item.file);
  for (const imported of item.imports ?? []) collectInitial(manifest[imported]);
}
collectInitial(entry);

let total = 0;
let initial = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".js")) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  if (initialFiles.has(`assets/${f}`)) initial += gz;
  const kind = initialFiles.has(`assets/${f}`) ? "initial" : "async";
  console.log(`  ${f}  ${(statSync(join(dir, f)).size / 1024).toFixed(1)} kB raw  ${(gz / 1024).toFixed(1)} kB gzip  ${kind}`);
}

const initialKb = initial / 1024;
const totalKb = total / 1024;
console.log(`\ninitial JS: ${initialKb.toFixed(1)} kB gzipped (budget ${INITIAL_BUDGET_KB} kB)`);
console.log(`total JS:   ${totalKb.toFixed(1)} kB gzipped (budget ${TOTAL_BUDGET_KB} kB)`);

if (initialKb > INITIAL_BUDGET_KB) {
  console.error(`\nFAIL: initial JavaScript over budget by ${(initialKb - INITIAL_BUDGET_KB).toFixed(1)} kB`);
  process.exit(1);
}
if (totalKb > TOTAL_BUDGET_KB) {
  console.error(`\nFAIL: total JavaScript over budget by ${(totalKb - TOTAL_BUDGET_KB).toFixed(1)} kB`);
  process.exit(1);
}
console.log("PASS");
