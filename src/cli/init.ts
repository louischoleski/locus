/**
 * `locus init` — scaffold a new .locus design file in the current directory.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE = `// Locus v0 design file
// Grammar: target Name { organism, tolerance, signatures, in [tissues] }
// Docs: see SPEC.md or run \`locus check\` to validate

target MyTarget {
  organism human
  tolerance 0
  signatures ACGTACGTACGTACGT
  in [ hepatocyte ] @asserted(human)
}

excise MyTarget
`;

export function init(): void {
  const dest = join(process.cwd(), "design.locus");

  if (existsSync(dest)) {
    console.error("design.locus already exists — refusing to overwrite.");
    process.exit(2);
  }

  writeFileSync(dest, TEMPLATE, "utf-8");

  console.log("Created design.locus");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Edit design.locus — define your target, organism, and guide signatures.");
  console.log("  2. Run `locus check design.locus` to validate syntax.");
  console.log("  3. Run `locus build design.locus --genome <ref.fa>` to build.");
}
