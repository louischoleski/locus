/**
 * Four static checks that run after parsing and before the IR is built.
 * Each is a hard error, not a warning.
 */

import type { ParsedTarget, ParseError } from "./parser.ts";

/**
 * 1. A combinator is required for two or more sites.
 * 2. `organism` is mandatory.
 * 3. `tolerance` is mandatory.
 * 4. Sequences in one `all` must be distinct.
 */
export function staticChecks(targets: ParsedTarget[]): ParseError[] {
  const errors: ParseError[] = [];

  for (const t of targets) {
    // Check 2: organism is mandatory
    if (t.organism === null) {
      errors.push({
        code: "E201",
        line: t.line,
        col: t.col,
        message: `target '${t.name}': organism is mandatory; axis O is meaningless without it`,
      });
    }

    // Check 3: tolerance is mandatory
    if (t.tolerance === null) {
      errors.push({
        code: "E202",
        line: t.line,
        col: t.col,
        message: `target '${t.name}': tolerance is mandatory; no default exists`,
      });
    }

    if (t.signatures) {
      // Check 1: combinator required for 2+ sites
      if (t.signatures.sites.length > 1 && t.signatures.combinator === null) {
        errors.push({
          code: "E203",
          line: t.line,
          col: t.col,
          message: `target '${t.name}': a combinator (all/any) is required for multiple sites`,
        });
      }

      // Check 4: sequences in `all` must be distinct
      if (t.signatures.combinator === "all") {
        const seen = new Set<string>();
        for (const site of t.signatures.sites) {
          if (seen.has(site)) {
            errors.push({
              code: "E204",
              line: t.line,
              col: t.col,
              message: `target '${t.name}': duplicate site '${site}' in 'all' combinator`,
            });
          }
          seen.add(site);
        }
      }
    }
  }

  return errors;
}
