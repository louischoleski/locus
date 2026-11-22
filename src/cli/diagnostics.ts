/**
 * Structured diagnostics for machine-readable output.
 *
 * Code groups:
 *   E1xx  lexical and syntax
 *   E2xx  static checks
 *   E3xx  resolution (tissue vocab, organism, vehicle)
 *   E4xx  schema (registry validation)
 *   R1xx  refusals (assertion refused — not an error)
 *
 * A refusal is not an error — it exits 1, not 2, and a build that
 * refuses an assertion still writes its manifest.
 */

export interface Diagnostic {
  code: string;
  file?: string;
  line?: number;
  col?: number;
  message: string;
}

/**
 * Convert assertion refusals into R1xx diagnostics.
 */
export function refusalDiagnostics(
  assertions: Array<{ name: string; status: string; reasons: string[] }>,
  file?: string,
): Diagnostic[] {
  const diags: Diagnostic[] = [];
  let counter = 0;

  for (const a of assertions) {
    if (a.status === "refused") {
      counter++;
      const code = `R1${counter.toString().padStart(2, "0")}`;
      diags.push({
        code,
        file,
        message: `${a.name} refused: ${a.reasons.length} reason(s) (locus why)`,
      });
    }
  }

  return diags;
}

/**
 * Format diagnostics for text output.
 */
export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags
    .map((d) => {
      const loc = d.line ? `${d.file ?? ""}:${d.line}:${d.col ?? 0}` : (d.file ?? "");
      return `${d.code}  ${loc}  ${d.message}`.trim();
    })
    .join("\n");
}

/**
 * Format diagnostics as JSON array.
 */
export function diagnosticsToJson(diags: Diagnostic[]): string {
  return JSON.stringify(diags, null, 2);
}
