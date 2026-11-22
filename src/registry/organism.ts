/**
 * Organism axis resolution.
 *
 * Given a fact annotated with an organism and a target's declared organism:
 *   fact_organism absent  → n/a   (header says organism_independent)
 *   fact_organism == target → same
 *   pair in relations table → related or distant (as declared)
 *   otherwise → distant
 *
 * The relations table ships as data in the registry, one row per ordered pair,
 * each row itself graded. A pair absent from the table resolves to `distant`.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Organism } from "../ir/grade.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RelationRow {
  from: string;
  to: string;
  o: Organism;
  grade: { m: string; o: string | null };
  note?: string;
}

export interface RelationsTable {
  relations: RelationRow[];
}

let cachedRelations: RelationsTable | null = null;

function loadRelations(relationsPath?: string): RelationsTable {
  if (cachedRelations && !relationsPath) return cachedRelations;
  const path = relationsPath ?? resolvePath(__dirname, "../../registry/relations.json");
  const data = JSON.parse(readFileSync(path, "utf-8")) as RelationsTable;
  if (!relationsPath) cachedRelations = data;
  return data;
}

/**
 * Resolve the organism axis value.
 *
 * @param factOrganism - The organism the fact was observed in, or null for organism-independent
 * @param targetOrganism - The target's declared organism
 * @param relationsPath - Optional path to relations table (for testing)
 */
export function resolveOrganismAxis(
  factOrganism: string | null,
  targetOrganism: string,
  relationsPath?: string,
): Organism {
  // null means organism-independent (e.g. capsid capacity)
  if (factOrganism === null) return "n/a";

  // Normalise to lowercase for comparison
  const factLower = factOrganism.toLowerCase();
  const targetLower = targetOrganism.toLowerCase();

  // Same organism
  if (factLower === targetLower) return "same";

  // Check the relations table
  const table = loadRelations(relationsPath);
  for (const row of table.relations) {
    if (row.from.toLowerCase() === factLower && row.to.toLowerCase() === targetLower) {
      return row.o;
    }
  }

  // Not in table → distant
  return "distant";
}

/**
 * Clear cached relations (for testing).
 */
export function clearRelationsCache(): void {
  cachedRelations = null;
}
