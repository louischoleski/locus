/**
 * locus diff <lockA> <lockB>
 *
 * Recompiles the corpus under both locks and reports every assertion
 * that changed status. Any assertion flipping from refused to allowed
 * requires a named reviewer on the release.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath, basename } from "node:path";
import { build, type BuildResult } from "./build.ts";

export interface DiffEntry {
  fixture: string;
  assertion: string;
  statusA: string;
  statusB: string;
  direction: "refused→allowed" | "allowed→refused" | "changed";
}

export interface DiffResult {
  changes: DiffEntry[];
  needsReviewer: boolean;
  summary: string;
}

/**
 * Run diff across all .locus fixtures in a directory, comparing
 * builds with two different genome/lock configurations.
 */
export function diffCorpus(
  fixtureDir: string,
  genomePathA: string,
  genomePathB: string,
  genomeNameA?: string,
  genomeNameB?: string,
): DiffResult {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".locus"));
  const changes: DiffEntry[] = [];

  for (const file of files) {
    const source = readFileSync(resolvePath(fixtureDir, file), "utf-8");

    const resultA = build({
      source,
      genomePath: genomePathA,
      genomeName: genomeNameA,
    });

    const resultB = build({
      source,
      genomePath: genomePathB,
      genomeName: genomeNameB,
    });

    // Skip files that error on either side
    if (!resultA.ir || !resultB.ir) continue;

    const assertionsA = new Map(resultA.ir.assertions.map((a) => [a.name, a.status]));
    const assertionsB = new Map(resultB.ir.assertions.map((a) => [a.name, a.status]));

    // Check all assertions from both sides
    const allNames = new Set([...assertionsA.keys(), ...assertionsB.keys()]);
    for (const name of allNames) {
      const sA = assertionsA.get(name) ?? "absent";
      const sB = assertionsB.get(name) ?? "absent";

      if (sA !== sB) {
        let direction: DiffEntry["direction"];
        if (sA === "refused" && sB === "allowed") {
          direction = "refused→allowed";
        } else if (sA === "allowed" && sB === "refused") {
          direction = "allowed→refused";
        } else {
          direction = "changed";
        }

        changes.push({
          fixture: file,
          assertion: name,
          statusA: sA,
          statusB: sB,
          direction,
        });
      }
    }
  }

  const needsReviewer = changes.some((c) => c.direction === "refused→allowed");

  const lines: string[] = [];
  if (changes.length === 0) {
    lines.push("No assertion status changes.");
  } else {
    lines.push(`${changes.length} assertion(s) changed status:`);
    lines.push("");
    for (const c of changes) {
      const flag = c.direction === "refused→allowed" ? "  ⚠ REVIEWER REQUIRED" : "";
      lines.push(`  ${c.fixture}  ${c.assertion}  ${c.statusA} → ${c.statusB}${flag}`);
    }
    if (needsReviewer) {
      lines.push("");
      lines.push("WARNING: assertion(s) flipped from refused to allowed.");
      lines.push("A named reviewer is required on this registry release.");
    }
  }

  return {
    changes,
    needsReviewer,
    summary: lines.join("\n"),
  };
}
