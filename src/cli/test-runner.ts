/**
 * locus test [path]
 *
 * Two-tier blocking rule:
 *   - Failing unit or property test → blocks the build (exit 2)
 *   - Failing golden or falsification fixture → blocks a registry release (exit 1)
 *
 * `locus test` exits non-zero on either. The publish step refuses on non-zero.
 *
 * Fixture metadata format (JSON alongside .locus files):
 * {
 *   "kind": "golden" | "falsification" | "unit",
 *   "expect": "refused" | "allowed" | "error",
 *   "assertion"?: "<name>",           // which assertion to check
 *   "holdout"?: { "date": "...", "lab": "...", "vector_family": "..." }
 * }
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve as resolvePath, basename } from "node:path";
import { build } from "./build.ts";
import { applyHoldout, type HoldoutSet, type FixtureHoldoutMeta } from "./holdout.ts";
import { validateObserved, type ObservedValue } from "../registry/normalisation.ts";

export type FixtureKind = "golden" | "falsification" | "unit";

export interface FixtureMeta {
  kind: FixtureKind;
  expect: "refused" | "allowed" | "error";
  assertion?: string;
  contested?: boolean;
  holdout?: {
    date?: string;
    lab?: string;
    vector_family?: string;
  };
  observed?: {
    entries: Array<{
      raw: string;
      normalised: number;
      rule: string;
      by: string;
      date: string;
    }>;
    contested: boolean;
  };
}

export interface TestResult {
  fixture: string;
  kind: FixtureKind;
  passed: boolean;
  message: string;
}

export interface TestSuiteResult {
  results: TestResult[];
  unitFailures: number;
  fixtureFailures: number;
  heldOut: number;
  passed: number;
  total: number;
  exitCode: number; // 0 pass, 1 fixture failure, 2 unit/error
  blocksRelease: boolean;
  blocksBuild: boolean;
}

export function runTests(
  testDir: string,
  genomePath: string,
  genomeName?: string,
  holdoutSet?: HoldoutSet,
): TestSuiteResult {
  const files = readdirSync(testDir).filter((f) => f.endsWith(".locus"));
  const results: TestResult[] = [];
  let unitFailures = 0;
  let fixtureFailures = 0;
  let heldOutCount = 0;
  let passed = 0;

  // Build holdout index if a holdout set is provided
  const holdoutIndex = new Set<string>();
  if (holdoutSet) {
    const metas: FixtureHoldoutMeta[] = [];
    for (const file of files) {
      const metaPath = resolvePath(testDir, file.replace(".locus", ".meta.json"));
      if (!existsSync(metaPath)) continue;
      const meta: FixtureMeta = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (meta.holdout) {
        metas.push({ fixture: file, holdout: meta.holdout });
      }
    }
    const holdoutResults = applyHoldout(metas, holdoutSet);
    for (const r of holdoutResults) {
      if (r.heldOut) holdoutIndex.add(r.fixture);
    }
  }

  for (const file of files) {
    const metaPath = resolvePath(testDir, file.replace(".locus", ".meta.json"));
    if (!existsSync(metaPath)) continue; // skip files without metadata

    const meta: FixtureMeta = JSON.parse(readFileSync(metaPath, "utf-8"));

    // Skip held-out fixtures from pass/fail scoring
    if (holdoutIndex.has(file)) {
      heldOutCount++;
      results.push({
        fixture: file,
        kind: meta.kind,
        passed: true, // not scored
        message: "held out — excluded from scoring",
      });
      continue;
    }

    // Skip contested fixtures from pass/fail scoring
    if (meta.contested) {
      results.push({
        fixture: file,
        kind: meta.kind,
        passed: true, // not scored
        message: "contested — excluded from scoring",
      });
      continue;
    }

    // Validate and handle observed normalisation block
    if (meta.observed) {
      const obsErrors = validateObserved(meta.observed);
      if (obsErrors.length > 0) {
        results.push({
          fixture: file,
          kind: meta.kind,
          passed: false,
          message: `observed block invalid: ${obsErrors[0]}`,
        });
        fixtureFailures++;
        continue;
      }
      if (meta.observed.contested) {
        results.push({
          fixture: file,
          kind: meta.kind,
          passed: true, // not scored
          message: "observed contested — excluded from scoring",
        });
        continue;
      }
    }

    const source = readFileSync(resolvePath(testDir, file), "utf-8");

    const result = build({
      source,
      genomePath,
      genomeName,
    });

    let testPassed = false;
    let message = "";

    switch (meta.expect) {
      case "error":
        testPassed = result.exitCode === 2;
        message = testPassed
          ? `correctly errored`
          : `expected error (exit 2), got exit ${result.exitCode}`;
        break;

      case "refused": {
        if (!meta.assertion) {
          // Any refusal
          testPassed = result.exitCode === 1;
          message = testPassed
            ? `correctly refused`
            : `expected refusal (exit 1), got exit ${result.exitCode}`;
        } else {
          const a = result.ir?.assertions.find((a) => a.name === meta.assertion);
          testPassed = a?.status === "refused";
          message = testPassed
            ? `${meta.assertion} correctly refused`
            : `expected ${meta.assertion} refused, got ${a?.status ?? "not found"}`;
        }
        break;
      }

      case "allowed": {
        if (!meta.assertion) {
          testPassed = result.exitCode === 0;
          message = testPassed
            ? `all assertions allowed`
            : `expected all allowed (exit 0), got exit ${result.exitCode}`;
        } else {
          const a = result.ir?.assertions.find((a) => a.name === meta.assertion);
          testPassed = a?.status === "allowed";
          message = testPassed
            ? `${meta.assertion} correctly allowed`
            : `expected ${meta.assertion} allowed, got ${a?.status ?? "not found"}`;
        }
        break;
      }
    }

    if (testPassed) {
      passed++;
    } else if (meta.kind === "unit") {
      unitFailures++;
    } else {
      fixtureFailures++;
    }

    results.push({
      fixture: file,
      kind: meta.kind,
      passed: testPassed,
      message,
    });
  }

  const blocksBuild = unitFailures > 0;
  const blocksRelease = fixtureFailures > 0 || blocksBuild;

  return {
    results,
    unitFailures,
    fixtureFailures,
    heldOut: heldOutCount,
    passed,
    total: results.length,
    exitCode: unitFailures > 0 ? 2 : fixtureFailures > 0 ? 1 : 0,
    blocksRelease,
    blocksBuild,
  };
}
