/**
 * Contract-test runner (RFC 0001 §4).
 *
 * Exists only to set RUN_CONTRACT_TESTS before handing off to vitest. The obvious
 * spelling — `RUN_CONTRACT_TESTS=1 vitest run ...` in package.json — is a POSIX shell
 * construct, and npm runs scripts through cmd.exe on Windows, where it fails with
 * "'RUN_CONTRACT_TESTS' is not recognized". CI never caught it because the runners are
 * Linux and the workflow also sets the variable at the job level; the break was only
 * ever visible to a contributor on Windows.
 *
 * Spawns vitest's entry with node directly rather than via the .bin shim, so there is
 * no shell involved on any platform.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");

const { status } = spawnSync(
  process.execPath,
  [vitest, "run", "src/lib/__tests__/contract.test.ts", ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root, env: { ...process.env, RUN_CONTRACT_TESTS: "1" } }
);

process.exit(status ?? 1);
