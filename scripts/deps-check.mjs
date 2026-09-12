/**
 * Dependency gate: require complete audit and installed-package licence evidence.
 * Incomplete/offline evidence is a failed check, never a successful audit.
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ALLOWED_LICENCES = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD",
  "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0",
]);
const OPTIONS = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 16 * 1024 * 1024 };

function npmJson(args, allowFindings = false) {
  let output;
  try {
    // npm run supplies its own CLI path; invoking it through Node also works on Windows.
    output = process.env.npm_execpath
      ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], OPTIONS)
      : execSync(args[0] === "audit" ? "npm audit --json" : "npm ls --all --json --long", OPTIONS);
  } catch (error) {
    if (!allowFindings || error.status !== 1 || !error.stdout) {
      throw new Error("npm " + args[0] + " did not return complete evidence");
    }
    output = error.stdout; // audit exits 1 when advisories are present.
  }
  const value = JSON.parse(output);
  if (!value || typeof value !== "object" || value.error) throw new Error("npm " + args[0] + " evidence is unavailable");
  return value;
}

// Evaluate the supported SPDX AND/OR expression subset, with AND precedence.
// Unknown identifiers/exception syntax fail closed; an allowed OR choice is sufficient.
function allowedLicence(expression) {
  if (typeof expression !== "string") return false;
  const tokens = expression.match(/[A-Za-z0-9.+-]+|[()]|[^\s]/g) ?? [];
  let index = 0;
  function atom() {
    const token = tokens[index++];
    if (token !== "(") return ALLOWED_LICENCES.has(token);
    const value = or();
    if (tokens[index++] !== ")") throw new Error("unbalanced licence expression");
    return value;
  }
  function and() {
    let value = atom();
    while (tokens[index] === "AND") { index++; const next = atom(); value = value && next; }
    return value;
  }
  function or() {
    let value = and();
    while (tokens[index] === "OR") { index++; const next = and(); value = value || next; }
    return value;
  }
  try { const value = or(); return index === tokens.length && value; } catch { return false; }
}

let failed = false;
console.log("dependency audit");
try {
  const audit = npmJson(["audit", "--json"], true);
  const counts = audit.metadata?.vulnerabilities;
  if (!counts || !["critical", "high", "moderate", "low"].every((level) =>
    Number.isInteger(counts[level]) && counts[level] >= 0
  )) throw new Error("audit vulnerability counts are missing or invalid");
  console.log("  critical " + counts.critical + " high " + counts.high + " moderate " + counts.moderate + " low " + counts.low);
  if (counts.high || counts.critical) throw new Error("high or critical advisories require resolution");
  console.log("  PASS: complete audit, no high or critical advisories");
} catch (error) {
  console.error("  FAIL: " + error.message);
  failed = true;
}

console.log("licence check");
try {
  const tree = npmJson(["ls", "--all", "--json", "--long"]);
  if (!tree.dependencies || typeof tree.dependencies !== "object" || tree.problems?.length) {
    throw new Error("installed dependency tree is incomplete");
  }
  const seen = new Set();
  const offenders = [];
  const walk = (node) => {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      // npm's successful tree includes empty entries for uninstalled optional/platform packages.
      if (Object.keys(dep).length === 0) continue;
      if (!dep.path || !dep.version || dep.missing || dep.invalid) throw new Error("missing installed metadata for " + name);
      const packagePath = resolve(dep.path);
      if (!seen.has(packagePath)) {
        seen.add(packagePath);
        let pkg;
        try { pkg = JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8")); }
        catch { throw new Error("licence metadata unreadable for " + name + "@" + dep.version); }
        if (pkg.name !== name || pkg.version !== dep.version) throw new Error("installed package identity mismatch for " + name);
        const licence = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
        if (!allowedLicence(licence)) offenders.push(name + "@" + dep.version + ": " + (licence ?? "licence missing"));
      }
      // A repeated path may have its nested dependencies expanded only in this occurrence.
      walk(dep);
    }
  };
  walk(tree);
  console.log("  " + seen.size + " installed package paths checked");
  if (offenders.length) throw new Error("licences outside the allow-list or unavailable:\n    " + offenders.join("\n    "));
  console.log("  PASS: every installed package licence is on the allow-list");
} catch (error) {
  console.error("  FAIL: " + error.message);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
