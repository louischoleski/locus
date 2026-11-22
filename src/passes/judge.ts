/**
 * Pass 3: judge
 *
 * Fold grades along `from` edges, compare each assertion against
 * its floor, mark allowed or refused with reasons. Write assertions.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveGrade, meetsFloor, type Fact, type Grade } from "../ir/grade.ts";
import type { Assertion, Target, OutcomeDistribution } from "../ir/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface FloorEntry {
  assertion: string;
  floor: { m: string; o: string };
}

function loadFloors(): FloorEntry[] {
  const floorsPath = resolvePath(__dirname, "../../registry/floors.json");
  const data = JSON.parse(readFileSync(floorsPath, "utf-8"));
  return data.floors;
}

/** Resolve the organism axis value relative to the target organism. */
function resolveOrganismAxis(factGrade: Grade, _targetOrganism: string): Grade {
  return factGrade; // Facts already carry resolved organism axis in v0
}

export function judge(
  target: Target,
  facts: Fact[],
  outcome: OutcomeDistribution,
): Assertion[] {
  const floors = loadFloors();
  const factMap = new Map(facts.map((f) => [f.id, f]));
  const assertions: Assertion[] = [];

  for (const entry of floors) {
    const floor: Grade = {
      m: entry.floor.m as Grade["m"],
      o: entry.floor.o as Grade["o"],
    };

    const reasons: string[] = [];

    // Find supporting facts for this assertion
    const supporting = facts.filter((f) => matchesClaim(f, entry.assertion));

    if (supporting.length === 0) {
      reasons.push("no supporting fact");
    } else {
      for (const f of supporting) {
        const eff = effectiveGrade(f.id, factMap);
        if (!meetsFloor(eff, floor)) {
          reasons.push(
            `fact ${f.id} grade (${eff.m}, ${eff.o}) does not meet floor (${floor.m}, ${floor.o})`,
          );
        }
      }
    }

    // Check assertion-specific conditions
    if (entry.assertion === "eliminates_reservoir") {
      if (!target.residence?.exhaustive) {
        reasons.push("residence not exhaustive (`only` absent)");
      }
      if (outcome.status === "unknown") {
        reasons.push("excise outcome distribution unknown");
      }
    }

    const allSupported =
      supporting.length > 0 &&
      reasons.length === 0;

    assertions.push({
      name: entry.assertion,
      supported_by: supporting.map((f) => f.id),
      floor,
      status: allSupported ? "allowed" : "refused",
      reasons,
    });
  }

  return assertions;
}

function matchesClaim(fact: Fact, assertion: string): boolean {
  const claimMap: Record<string, string[]> = {
    signature_unique_in_reference: ["site_occurrences"],
    sequence_unique_in_host: ["unique_in_host", "sequence_unique_in_host"],
    construct_fits_vehicle: ["construct_fits"],
    eliminates_reservoir: ["eliminates_reservoir", "residence_exhaustive"],
  };
  const claims = claimMap[assertion] ?? [];
  return claims.includes(fact.claim);
}
