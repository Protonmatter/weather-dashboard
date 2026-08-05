/**
 * Bundle size budget. Fails CI when the gzipped JS crosses the ceiling, so a careless
 * dependency shows up in review rather than in someone's page load.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET_KB = 90;
const dir = "dist/assets";

let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".js")) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`  ${f}  ${(statSync(join(dir, f)).size / 1024).toFixed(1)} kB raw  ${(gz / 1024).toFixed(1)} kB gzip`);
}

const kb = total / 1024;
console.log(`\ntotal JS: ${kb.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB)`);

if (kb > BUDGET_KB) {
  console.error(`\nFAIL: over budget by ${(kb - BUDGET_KB).toFixed(1)} kB`);
  process.exit(1);
}
console.log("PASS");
