/**
 * Two-axis grade algebra.
 *
 * Axis M (method): computed > measured > inferred > asserted > unknown
 * Axis O (organism distance): n/a > same > related > distant > unknown
 *
 * Meet is componentwise minimum. A fact's effective grade is the
 * meet of its own grade and the effective grades of all its parents.
 */

export const METHOD_ORDER = ["computed", "measured", "inferred", "asserted", "unknown"] as const;
export type Method = (typeof METHOD_ORDER)[number];

export const ORGANISM_ORDER = ["n/a", "same", "related", "distant", "unknown"] as const;
export type Organism = (typeof ORGANISM_ORDER)[number];

export interface Grade {
  m: Method;
  o: Organism;
}

const METHOD_RANK: Record<Method, number> = Object.fromEntries(
  METHOD_ORDER.map((v, i) => [v, i]),
) as Record<Method, number>;

const ORGANISM_RANK: Record<Organism, number> = Object.fromEntries(
  ORGANISM_ORDER.map((v, i) => [v, i]),
) as Record<Organism, number>;

/** Componentwise minimum of two grades. */
export function meet(a: Grade, b: Grade): Grade {
  return {
    m: METHOD_RANK[a.m] >= METHOD_RANK[b.m] ? a.m : b.m,
    o: ORGANISM_RANK[a.o] >= ORGANISM_RANK[b.o] ? a.o : b.o,
  };
}

/** True if `a` meets or exceeds `floor` on both axes. */
export function meetsFloor(a: Grade, floor: Grade): boolean {
  return METHOD_RANK[a.m] <= METHOD_RANK[floor.m] && ORGANISM_RANK[a.o] <= ORGANISM_RANK[floor.o];
}

/** Returns true if grades are equal on both axes. */
export function gradeEq(a: Grade, b: Grade): boolean {
  return a.m === b.m && a.o === b.o;
}

// --- Fact graph and grade fold ---

export interface Fact {
  id: string;
  claim: string;
  subject: Record<string, unknown>;
  value: unknown;
  grade: Grade;
  from: string[];
  source?: string;
  note?: string;
  provenance?: {
    model: string;
    model_version: string;
    prompt_hash: string;
    extraction_date: string;
    source_id: string;
    source_span?: { start: number; end: number };
    reviewer: string | null;
  };
}

/**
 * Compute the effective grade of a fact by folding meet over its
 * ancestry. This is a simple DFS with memoisation.
 */
export function effectiveGrade(factId: string, facts: ReadonlyMap<string, Fact>): Grade {
  const memo = new Map<string, Grade>();

  function walk(id: string): Grade {
    if (memo.has(id)) return memo.get(id)!;

    const fact = facts.get(id);
    if (!fact) throw new Error(`unknown fact: ${id}`);

    let g = fact.grade;
    for (const parentId of fact.from) {
      g = meet(g, walk(parentId));
    }

    memo.set(id, g);
    return g;
  }

  return walk(factId);
}
