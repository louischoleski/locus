import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Grade {
  m: string;
  o: string | null;
}

export interface Diagnostic {
  code: string;
  path: string;
  message: string;
}

const METHOD_VALUES = ["computed", "measured", "inferred", "asserted", "unknown"];

/** Load the JSON Schema for registry headers. */
function loadSchema(): Record<string, unknown> {
  const schemaPath = resolve(__dirname, "../../registry/schema.json");
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

/**
 * Deep-check that every value-bearing field carries a grade object
 * with valid m and o values. The JSON Schema handles structure;
 * this catches the semantic rule the spec cares about most:
 * "The validator rejects any field lacking a grade."
 */
function checkGrades(obj: unknown, path: string, diags: Diagnostic[]): void {
  if (obj === null || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      checkGrades(obj[i], `${path}[${i}]`, diags);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Fields that must carry a grade when they hold a value
  const GRADED_FIELDS = ["capacity", "redosable"];
  const GRADED_ARRAY_ITEMS = ["tropism"];

  for (const key of Object.keys(record)) {
    if (key === "grade") {
      validateGradeValue(record[key], path, diags);
      continue;
    }
    if (key === "provenance" || key === "id" || key === "kind" || key === "accepts" || key === "requires") {
      continue; // structural, not value-bearing
    }
    checkGrades(record[key], `${path}.${key}`, diags);
  }

  // If this object has value-like keys but no grade, flag it
  if (isValueBearing(record) && !("grade" in record)) {
    diags.push({
      code: "E401",
      path,
      message: "value-bearing field lacks a grade annotation",
    });
  }
}

function isValueBearing(obj: Record<string, unknown>): boolean {
  // An object is value-bearing if it has a "value" key or measurement keys
  // but is not purely structural
  const valueKeys = ["value", "nominal_kb", "soft_limit_kb", "level"];
  return valueKeys.some((k) => k in obj);
}

function validateGradeValue(grade: unknown, path: string, diags: Diagnostic[]): void {
  if (grade === null || typeof grade !== "object") {
    diags.push({ code: "E402", path: `${path}.grade`, message: "grade must be an object" });
    return;
  }

  const g = grade as Record<string, unknown>;

  if (!("m" in g)) {
    diags.push({ code: "E403", path: `${path}.grade`, message: "grade missing method axis (m)" });
  } else if (!METHOD_VALUES.includes(g.m as string)) {
    diags.push({
      code: "E404",
      path: `${path}.grade.m`,
      message: `invalid method value: ${g.m}; expected one of ${METHOD_VALUES.join(", ")}`,
    });
  }

  if (!("o" in g)) {
    diags.push({ code: "E405", path: `${path}.grade`, message: "grade missing organism axis (o)" });
  }
}

/**
 * Validate a header's structure against the JSON Schema (structural)
 * and the grade rule (semantic). Returns diagnostics; empty = valid.
 */
export function validateHeader(header: unknown): Diagnostic[] {
  const diags: Diagnostic[] = [];

  if (header === null || typeof header !== "object" || Array.isArray(header)) {
    diags.push({ code: "E400", path: "$", message: "header must be a JSON object" });
    return diags;
  }

  const h = header as Record<string, unknown>;

  // Required fields
  const schema = loadSchema();
  const required = (schema.required as string[]) || [];
  for (const field of required) {
    if (!(field in h)) {
      diags.push({ code: "E406", path: `$.${field}`, message: `required field '${field}' is missing` });
    }
  }

  // ID format: namespace/name
  if (typeof h.id === "string" && !/^[a-zA-Z_]\w*\/[a-zA-Z_]\w*$/.test(h.id)) {
    diags.push({ code: "E407", path: "$.id", message: `invalid id format: '${h.id}'; expected namespace/name` });
  }

  // Grade completeness — the core rule
  checkGrades(header, "$", diags);

  return diags;
}

/**
 * Validate a header file by path. Returns diagnostics.
 */
export function validateHeaderFile(filePath: string): Diagnostic[] {
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    return [{ code: "E400", path: filePath, message: `failed to parse: ${(e as Error).message}` }];
  }
  return validateHeader(content);
}
