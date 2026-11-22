/**
 * Extraction provenance.
 *
 * An extracted field records model identity and version, prompt hash,
 * extraction date, source identifier and the character span it came from,
 * and the reviewer or null.
 *
 * An unreviewed field is capped at `inferred` on the method axis and
 * keeps its organism axis untouched. Review affects how a fact was obtained,
 * never which organism it came from.
 */

import type { Grade, Method } from "../ir/grade.ts";
import { METHOD_ORDER } from "../ir/grade.ts";

export interface ExtractionProvenance {
  model: string;              // e.g. "gpt-4o", "claude-3.5-sonnet"
  model_version: string;      // e.g. "2024-08-06"
  prompt_hash: string;        // sha256 of the prompt used
  extraction_date: string;    // ISO date
  source_id: string;          // DOI, PMID, etc.
  source_span?: {             // character span in source document
    start: number;
    end: number;
  };
  reviewer: string | null;    // null = unreviewed
}

const METHOD_RANK: Record<Method, number> = Object.fromEntries(
  METHOD_ORDER.map((v, i) => [v, i]),
) as Record<Method, number>;

/**
 * Cap a grade's method axis based on extraction review status.
 * Unreviewed fields are capped at `inferred`.
 * Reviewed fields pass through unchanged.
 */
export function capGradeForExtraction(grade: Grade, provenance: ExtractionProvenance): Grade {
  if (provenance.reviewer !== null) {
    return grade; // reviewed — no cap
  }

  // Unreviewed: cap method axis at `inferred`
  const inferredRank = METHOD_RANK["inferred"];
  const currentRank = METHOD_RANK[grade.m];

  // If current is stronger than inferred, cap it
  if (currentRank < inferredRank) {
    return { m: "inferred", o: grade.o };
  }

  return grade;
}

/**
 * Validate extraction provenance fields.
 */
export function validateProvenance(prov: unknown): string[] {
  const errors: string[] = [];
  if (prov === null || typeof prov !== "object") {
    return ["provenance must be an object"];
  }

  const p = prov as Record<string, unknown>;
  const required = ["model", "model_version", "prompt_hash", "extraction_date", "source_id"];
  for (const field of required) {
    if (!(field in p) || typeof p[field] !== "string" || (p[field] as string).length === 0) {
      errors.push(`provenance.${field} is required and must be a non-empty string`);
    }
  }

  if ("reviewer" in p && p.reviewer !== null && typeof p.reviewer !== "string") {
    errors.push("provenance.reviewer must be a string or null");
  }

  if ("source_span" in p && p.source_span !== null) {
    const span = p.source_span as Record<string, unknown>;
    if (typeof span?.start !== "number" || typeof span?.end !== "number") {
      errors.push("provenance.source_span must have numeric start and end");
    } else if (span.start > span.end) {
      errors.push("provenance.source_span.start must be <= end");
    }
  }

  return errors;
}
