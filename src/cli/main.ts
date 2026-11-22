#!/usr/bin/env node

/**
 * Locus CLI
 *
 * locus build <file> --genome <fasta>   0 ok, 1 refused, 2 error
 * locus check <file>                    parse and static checks only
 * locus why <assertion>                 derivation walk (requires prior build)
 * locus registry validate <path>        0 valid, 2 invalid
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { HoldoutSet } from "./holdout.ts";
import { build } from "./build.ts";
import { diffCorpus } from "./diff.ts";
import { runTests } from "./test-runner.ts";
import { resolve } from "../passes/resolve.ts";
import { validateHeaderFile } from "../registry/validate.ts";
import { refusalDiagnostics, diagnosticsToJson, type Diagnostic } from "./diagnostics.ts";
import { effectiveGrade, type Fact } from "../ir/grade.ts";

const args = process.argv.slice(2);
const command = args[0];

function usage(): never {
  console.error(`Usage:
  locus build <file> --genome <fasta> [--genome-name <name>] [--json]
  locus check <file>
  locus test <fixtures-dir> --genome <fasta> [--genome-name <name>] [--no-holdout]
  locus diff <fixtures-dir> --genome-a <fasta> --genome-b <fasta> [--name-a <n>] [--name-b <n>]
  locus why <assertion> <file> --genome <fasta> [--genome-name <name>]
  locus why <assertion> --ir <ir.json>
  locus audit <file> --genome <fasta> [--genome-name <name>] [--facts <json>]
  locus init
  locus registry validate <path>
`);
  process.exit(2);
}

function flagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

switch (command) {
  case "build": {
    const file = args[1];
    const genomePath = flagValue("--genome");
    if (!file || !genomePath) usage();

    const source = readFileSync(resolvePath(file), "utf-8");
    const precomputed = flagValue("--precomputed");
    const externalFacts = flagValue("--facts");
    const result = build({
      source,
      genomePath: resolvePath(genomePath),
      genomeName: flagValue("--genome-name"),
      json: args.includes("--json"),
      scanCacheDir: flagValue("--scan-cache"),
      precomputedPath: precomputed ? resolvePath(precomputed) : undefined,
      externalFactsPath: externalFacts ? resolvePath(externalFacts) : undefined,
    });

    const isJson = args.includes("--json");

    if (result.errors && result.errors.length > 0) {
      const diags: Diagnostic[] = result.errors.map((e) => ({
        code: e.code,
        file,
        line: e.line,
        col: e.col,
        message: e.message,
      }));
      if (isJson) {
        console.error(diagnosticsToJson(diags));
      } else {
        for (const e of result.errors) {
          const loc = e.line ? `:${e.line}:${e.col}` : "";
          console.error(`${e.code}  ${file}${loc}  ${e.message}`);
        }
      }
    }

    if (isJson && result.ir) {
      // Append refusal diagnostics to the IR output
      const refusals = refusalDiagnostics(result.ir.assertions, file);
      console.log(JSON.stringify({ ...result.ir, diagnostics: refusals }, null, 2));
    } else if (result.manifest) {
      console.log(result.manifest);
    }

    process.exit(result.exitCode);
    break;
  }

  case "check": {
    const file = args[1];
    if (!file) usage();

    const source = readFileSync(resolvePath(file), "utf-8");
    const result = resolve(source);

    if ("target" in result) {
      if (result.errors.length === 0) {
        console.log("OK");
        process.exit(0);
      }
    }

    const errors = "errors" in result ? result.errors : [];
    for (const e of errors) {
      const loc = e.line ? `:${e.line}:${e.col}` : "";
      console.error(`${e.code}  ${file}${loc}  ${e.message}`);
    }
    process.exit(2);
    break;
  }

  case "why": {
    const assertion = args[1];
    if (!assertion) usage();

    let ir: { assertions: any[]; facts: Fact[] };
    const irPath = flagValue("--ir");

    if (irPath) {
      // Legacy mode: load from pre-built IR JSON
      ir = JSON.parse(readFileSync(resolvePath(irPath), "utf-8"));
    } else {
      // Inline mode: build and extract IR
      const whyFile = args[2];
      const whyGenome = flagValue("--genome");
      if (!whyFile || !whyGenome) {
        console.error("locus why needs either --ir <file> or <design.locus> --genome <fasta>");
        process.exit(2);
      }
      const whySource = readFileSync(resolvePath(whyFile), "utf-8");
      const whyResult = build({
        source: whySource,
        genomePath: resolvePath(whyGenome),
        genomeName: flagValue("--genome-name"),
      });
      if (!whyResult.ir) {
        if (whyResult.errors) {
          for (const e of whyResult.errors) {
            const loc = e.line ? `:${e.line}:${e.col}` : "";
            console.error(`${e.code}  ${whyFile}${loc}  ${e.message}`);
          }
        }
        process.exit(2);
      }
      ir = whyResult.ir;
    }

    const a = ir.assertions?.find((x: { name: string }) => x.name === assertion);
    if (!a) {
      console.error(`assertion '${assertion}' not found`);
      console.error(`available: ${ir.assertions.map((x: { name: string }) => x.name).join(", ")}`);
      process.exit(2);
    }

    const factMap = new Map<string, Fact>(ir.facts.map((f: Fact) => [f.id, f]));
    const status = a.status.toUpperCase();
    const floor = `(${a.floor.m}, ${a.floor.o})`;
    console.log(`${status}  floor ${floor}`);

    if (a.reasons.length > 0) {
      for (const r of a.reasons) {
        console.log(`  └─ ${r}`);
      }
    }

    for (const fid of a.supported_by) {
      function walkFact(id: string, depth: number) {
        const f = factMap.get(id);
        if (!f) return;
        const eff = effectiveGrade(id, factMap);
        const indent = "  ".repeat(depth);
        const src = f.source ? `  [${f.source}]` : "";
        console.log(`${indent}└─ ${f.id}: ${f.claim} = ${JSON.stringify(f.value)}   (${eff.m}, ${eff.o})${src}`);
        for (const pid of f.from) {
          walkFact(pid, depth + 1);
        }
      }
      walkFact(fid, 1);
    }

    process.exit(a.status === "refused" ? 1 : 0);
    break;
  }

  case "test": {
    const testDir = args[1];
    const testGenome = flagValue("--genome");
    if (!testDir || !testGenome) usage();

    // Load default holdout set unless --no-holdout is passed
    let holdout: HoldoutSet | undefined;
    if (!args.includes("--no-holdout")) {
      const holdoutPath = resolvePath("registry/holdout.json");
      if (existsSync(holdoutPath)) {
        const raw = JSON.parse(readFileSync(holdoutPath, "utf-8"));
        holdout = {
          after_date: raw.after_date,
          labs: raw.labs,
          vector_families: raw.vector_families,
        };
      }
    }

    const testResult = runTests(
      resolvePath(testDir),
      resolvePath(testGenome),
      flagValue("--genome-name"),
      holdout,
    );

    for (const r of testResult.results) {
      const icon = r.passed ? "✓" : "✗";
      const kind = `[${r.kind}]`;
      console.log(`  ${icon} ${kind.padEnd(16)} ${r.fixture}  ${r.message}`);
    }

    console.log("");
    console.log(`${testResult.passed}/${testResult.total} passed`);
    if (testResult.heldOut > 0) console.log(`${testResult.heldOut} held out`);
    if (testResult.blocksBuild) console.log("BLOCKS BUILD: unit test failure");
    if (testResult.blocksRelease && !testResult.blocksBuild) console.log("BLOCKS RELEASE: fixture failure");

    process.exit(testResult.exitCode);
    break;
  }

  case "diff": {
    const fixtureDir = args[1];
    const genomeA = flagValue("--genome-a");
    const genomeB = flagValue("--genome-b");
    if (!fixtureDir || !genomeA || !genomeB) usage();

    const result = diffCorpus(
      resolvePath(fixtureDir),
      resolvePath(genomeA),
      resolvePath(genomeB),
      flagValue("--name-a"),
      flagValue("--name-b"),
    );

    console.log(result.summary);
    if (args.includes("--json")) {
      console.log(JSON.stringify(result.changes, null, 2));
    }
    process.exit(result.needsReviewer ? 1 : 0);
    break;
  }

  case "audit": {
    const auditFile = args[1];
    const auditGenome = flagValue("--genome");
    if (!auditFile || !auditGenome) usage();

    const auditSource = readFileSync(resolvePath(auditFile), "utf-8");
    const auditExternalFacts = flagValue("--facts");
    const auditResult = build({
      source: auditSource,
      genomePath: resolvePath(auditGenome),
      genomeName: flagValue("--genome-name"),
      externalFactsPath: auditExternalFacts ? resolvePath(auditExternalFacts) : undefined,
    });

    if (!auditResult.ir) {
      if (auditResult.errors) {
        for (const e of auditResult.errors) {
          console.error(`${e.code}  ${e.message}`);
        }
      }
      process.exit(2);
    }

    const { audit: runAudit } = await import("./audit.ts");
    const auditReport = runAudit(auditResult.ir);

    if (args.includes("--json")) {
      const { report: _, ...data } = auditReport;
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(auditReport.report);
    }

    process.exit(auditReport.completeness.refused > 0 ? 1 : 0);
    break;
  }

  case "registry": {
    if (args[1] === "validate" && args[2]) {
      const diags = validateHeaderFile(resolvePath(args[2]));
      if (diags.length === 0) {
        console.log("VALID");
        process.exit(0);
      }
      for (const d of diags) {
        console.error(`${d.code}  ${d.path}  ${d.message}`);
      }
      process.exit(2);
    }
    usage();
    break;
  }

  case "init": {
    const { init } = await import("./init.ts");
    init();
    break;
  }

  default:
    usage();
}
