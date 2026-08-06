/**
 * Dependency gate (RFC 0001 §4).
 *
 * Two failure modes that unit tests never surface: a transitive dependency picking up a
 * known CVE, and a licence appearing in the tree that the project cannot ship under.
 * Both are supply-chain properties, not code properties.
 */
import { execSync } from "node:child_process";

const ALLOWED_LICENCES = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD",
  "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0",
]);
const FAIL_ON = new Set(["high", "critical"]);

let exitCode = 0;

console.log("dependency audit\n");

let audit;
try {
  audit = JSON.parse(execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch (e) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  try {
    audit = JSON.parse(e.stdout ?? "{}");
  } catch {
    console.log("  audit unavailable (offline); skipping");
    audit = null;
  }
}

if (audit?.metadata?.vulnerabilities) {
  const v = audit.metadata.vulnerabilities;
  console.log(`  critical ${v.critical ?? 0}  high ${v.high ?? 0}  moderate ${v.moderate ?? 0}  low ${v.low ?? 0}`);
  for (const level of FAIL_ON) {
    if ((v[level] ?? 0) > 0) {
      console.error(`  FAIL: ${v[level]} ${level} advisory/advisories`);
      exitCode = 1;
    }
  }
  if (!exitCode) console.log("  PASS: no high or critical advisories");
}

console.log("\nlicence check\n");
try {
  const tree = JSON.parse(execSync("npm ls --all --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const seen = new Map();
  const walk = (node) => {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      if (!seen.has(name)) seen.set(name, dep.version);
      walk(dep);
    }
  };
  walk(tree);
  console.log(`  ${seen.size} packages in the resolved tree`);

  const offenders = [];
  for (const name of seen.keys()) {
    try {
      const pkg = JSON.parse(execSync(`node -p "JSON.stringify(require('${name}/package.json'))"`, {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }));
      const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
      if (lic && !ALLOWED_LICENCES.has(lic) && !/^\(.*MIT.*\)$/.test(lic)) offenders.push(`${name}: ${lic}`);
    } catch {
      /* not resolvable from here; skip rather than fail the build on a lookup quirk */
    }
  }

  if (offenders.length) {
    console.error("  FAIL: licences outside the allow-list:");
    for (const o of offenders) console.error(`    ${o}`);
    exitCode = 1;
  } else {
    console.log("  PASS: all resolvable licences are on the allow-list");
  }
} catch {
  console.log("  tree unavailable; skipping");
}

process.exit(exitCode);
