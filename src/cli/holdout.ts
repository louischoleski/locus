/**
 * Three-key holdout split.
 *
 * Holdout by publication date alone leaks, because the same lab publishes
 * on both sides of a cutoff and shares priors with itself. v0 splits on
 * three keys at once: date, lab, and vector family. A fixture is held out
 * if it matches the holdout set on ANY one of them.
 */

export interface HoldoutKeys {
  date?: string;        // ISO date, e.g. "2024-06-01"
  lab?: string;         // lab identifier
  vector_family?: string; // e.g. "AAV", "LNP"
}

export interface FixtureHoldoutMeta {
  fixture: string;
  holdout: HoldoutKeys;
}

export interface HoldoutSet {
  after_date?: string;      // holdout fixtures published after this date
  labs?: string[];           // holdout these labs
  vector_families?: string[]; // holdout these vector families
}

export interface HoldoutResult {
  fixture: string;
  heldOut: boolean;
  reasons: string[];
}

/**
 * Determine which fixtures are held out given a holdout set.
 * A fixture is held out if it matches the holdout set on ANY one key.
 */
export function applyHoldout(
  fixtures: FixtureHoldoutMeta[],
  holdoutSet: HoldoutSet,
): HoldoutResult[] {
  return fixtures.map((f) => {
    const reasons: string[] = [];

    // Date check
    if (holdoutSet.after_date && f.holdout.date) {
      if (f.holdout.date > holdoutSet.after_date) {
        reasons.push(`date ${f.holdout.date} > cutoff ${holdoutSet.after_date}`);
      }
    }

    // Lab check
    if (holdoutSet.labs && f.holdout.lab) {
      if (holdoutSet.labs.includes(f.holdout.lab)) {
        reasons.push(`lab '${f.holdout.lab}' in holdout set`);
      }
    }

    // Vector family check
    if (holdoutSet.vector_families && f.holdout.vector_family) {
      if (holdoutSet.vector_families.includes(f.holdout.vector_family)) {
        reasons.push(`vector family '${f.holdout.vector_family}' in holdout set`);
      }
    }

    return {
      fixture: f.fixture,
      heldOut: reasons.length > 0,
      reasons,
    };
  });
}

/**
 * Partition fixtures into training and holdout sets.
 */
export function partitionFixtures(
  fixtures: FixtureHoldoutMeta[],
  holdoutSet: HoldoutSet,
): { training: string[]; holdout: string[] } {
  const results = applyHoldout(fixtures, holdoutSet);
  return {
    training: results.filter((r) => !r.heldOut).map((r) => r.fixture),
    holdout: results.filter((r) => r.heldOut).map((r) => r.fixture),
  };
}
