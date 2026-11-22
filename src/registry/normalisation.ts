/**
 * Normalisation records for fixtures.
 *
 * Every fixture keeps the raw reported value verbatim alongside the normalised
 * one, the rule applied, and who applied it. Where two curators disagree,
 * both entries are kept and the fixture is flagged `contested`; it stays in
 * the corpus and is excluded from pass/fail scoring.
 */

export interface NormalisationEntry {
  raw: string;
  normalised: number;
  rule: string;
  by: string;
  date: string;
}

export interface ObservedValue {
  entries: NormalisationEntry[];
  contested: boolean;
}

/**
 * Build an ObservedValue from one or more normalisation entries.
 * Automatically flags as contested if entries disagree on the normalised value.
 */
export function buildObserved(entries: NormalisationEntry[]): ObservedValue {
  if (entries.length === 0) {
    return { entries: [], contested: false };
  }

  if (entries.length === 1) {
    return { entries, contested: false };
  }

  // Check if all normalised values agree
  const values = new Set(entries.map((e) => e.normalised));
  const contested = values.size > 1;

  return { entries, contested };
}

/**
 * Validate a normalisation entry.
 */
export function validateNormalisationEntry(entry: unknown): string[] {
  const errors: string[] = [];
  if (entry === null || typeof entry !== "object") {
    return ["normalisation entry must be an object"];
  }

  const e = entry as Record<string, unknown>;

  if (typeof e.raw !== "string" || e.raw.length === 0) {
    errors.push("raw must be a non-empty string (verbatim reported value)");
  }

  if (typeof e.normalised !== "number" || isNaN(e.normalised as number)) {
    errors.push("normalised must be a number");
  }

  if (typeof e.rule !== "string" || e.rule.length === 0) {
    errors.push("rule must be a non-empty string identifying the normalisation rule");
  }

  if (typeof e.by !== "string" || e.by.length === 0) {
    errors.push("by must be a non-empty string identifying the curator");
  }

  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date as string)) {
    errors.push("date must be an ISO date string (YYYY-MM-DD)");
  }

  return errors;
}

/**
 * Validate an observed value block (one or more normalisation entries).
 */
export function validateObserved(observed: unknown): string[] {
  const errors: string[] = [];
  if (observed === null || typeof observed !== "object") {
    return ["observed must be an object"];
  }

  const o = observed as Record<string, unknown>;

  if (!Array.isArray(o.entries)) {
    errors.push("observed.entries must be an array");
    return errors;
  }

  for (let i = 0; i < o.entries.length; i++) {
    const entryErrors = validateNormalisationEntry(o.entries[i]);
    for (const err of entryErrors) {
      errors.push(`entries[${i}]: ${err}`);
    }
  }

  return errors;
}
