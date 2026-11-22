/**
 * Manifest writer — four sections: FACTS, ASSERTIONS, UNKNOWN, LOCK.
 */

import type { Fact, Grade } from "../ir/grade.ts";
import type { Assertion, OutcomeDistribution, Lock, Target } from "../ir/types.ts";
import { effectiveGrade } from "../ir/grade.ts";

function fmtGrade(g: Grade): string {
  return `(${g.m}, ${g.o})`;
}

export function writeManifest(
  target: Target,
  facts: Fact[],
  assertions: Assertion[],
  outcome: OutcomeDistribution,
  lock: Lock,
  tolerance: number,
  nearMatches?: { tolerance: number; count: number }[],
): string {
  const lines: string[] = [];
  const factMap = new Map(facts.map((f) => [f.id, f]));

  // FACTS
  lines.push("FACTS");
  for (const f of facts) {
    const eff = effectiveGrade(f.id, factMap);
    const from = f.from.length > 0 ? `  <- ${f.from.join(", ")}` : "";
    const subj = Object.entries(f.subject)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    lines.push(`  ${f.id}  ${f.claim}(${subj}) = ${JSON.stringify(f.value)}   ${fmtGrade(eff)}${from}`);
  }

  lines.push("");

  // ASSERTIONS
  lines.push("ASSERTIONS");
  for (const a of assertions) {
    const status = a.status.toUpperCase();
    if (a.status === "allowed") {
      lines.push(`  ${a.name}   ${status}   ${a.supported_by.join(", ")} meets ${fmtGrade(a.floor)}`);
    } else {
      lines.push(`  ${a.name}   ${status}`);
      for (const r of a.reasons) {
        lines.push(`    ${r}`);
      }
    }
  }

  lines.push("");

  // UNKNOWN
  lines.push("UNKNOWN");
  if (outcome.status === "unknown") {
    lines.push("  outcome distribution for excise");
  }
  lines.push("  host genome (reference used as proxy)");
  lines.push("  off-target analysis not performed (PAM-adjacency and bulges unmodelled)");
  if (nearMatches && nearMatches.length > 0) {
    for (const nm of nearMatches) {
      lines.push(`  near-matches above declared tolerance ${tolerance}: ${nm.count} sites at <=${nm.tolerance} mismatches`);
    }
  }

  lines.push("");

  // LOCK
  lines.push("LOCK");
  for (const [key, hash] of Object.entries(lock)) {
    lines.push(`  ${key}   ${hash}`);
  }

  lines.push("");
  return lines.join("\n");
}
