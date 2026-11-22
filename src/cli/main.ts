#!/usr/bin/env node

/**
 * Locus CLI
 *
 * locus build <file> --genome <fasta>   0 ok, 1 refused, 2 error
 * locus check <file>                    parse and static checks only
 * locus why <assertion>                 derivation walk (requires prior build)
 * locus registry validate <path>        0 valid, 2 invalid
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
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
  locus test <fixtures-dir> --genome <fasta> [--genome-name <name>]
  locus diff <fixtures-dir> --genome-a <fasta> --genome-b <fasta> [--name-a <n>] [--name-b <n>]
  locus why <assertion> --ir <ir.json>
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
    const result = build({
      source,
      genomePath: resolvePath(genomePath),
      genomeName: flagValue("--genome-name"),
      json: args.includes("--json"),
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
    const irPath = flagValue("--ir");
    if (!assertion || !irPath) usage();

    const ir = JSON.parse(readFileSync(resolvePath(irPath), "utf-8"));
    const a = ir.assertions?.find((x: { name: string }) => x.name === assertion);
    if (!a) {
      console.error(`assertion '${assertion}' not found in IR`);
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

    const testResult = runTests(
      resolvePath(testDir),
      resolvePath(testGenome),
      flagValue("--genome-name"),
    );

    for (const r of testResult.results) {
      const icon = r.passed ? "✓" : "✗";
      const kind = `[${r.kind}]`;
      console.log(`  ${icon} ${kind.padEnd(16)} ${r.fixture}  ${r.message}`);
    }

    console.log("");
    console.log(`${testResult.passed}/${testResult.total} passed`);
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

  default:
    usage();
}
