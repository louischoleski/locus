/**
 * locus build — the full pipeline: resolve → scan → judge → manifest.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath, basename } from "node:path";
import { resolve } from "../passes/resolve.ts";
import { scanSite, readFasta } from "../passes/scan.ts";
import { judge } from "../passes/judge.ts";
import { writeManifest } from "../passes/manifest.ts";
import { resolveOrganismAxis } from "../registry/organism.ts";
import { effectiveGrade, type Fact, type Grade } from "../ir/grade.ts";
import type { IR, OutcomeDistribution, Lock } from "../ir/types.ts";
import { EXCISE_OUTCOMES } from "../ir/types.ts";

export interface BuildOptions {
  source: string;
  genomePath: string;
  genomeName?: string;
  json?: boolean;
}

export interface BuildResult {
  exitCode: number; // 0 ok, 1 refused, 2 error
  manifest?: string;
  ir?: IR;
  errors?: Array<{ code: string; line?: number; col?: number; message: string }>;
}

export function build(opts: BuildOptions): BuildResult {
  // Pass 1: resolve
  const resolved = resolve(opts.source);
  if (!("target" in resolved)) {
    return { exitCode: 2, errors: resolved.errors };
  }

  const { target, intent, facts, vocabVersions } = resolved;

  // Resolve organism axis on all facts from pass 1
  for (const fact of facts) {
    if (fact.grade.o !== "n/a" && fact.grade.o !== "unknown") {
      fact.grade = {
        ...fact.grade,
        o: resolveOrganismAxis(fact.grade.o, target.organism),
      };
    }
  }

  // Pass 2: scan
  const { sequence: genome, hash: genomeHash } = readFasta(opts.genomePath);
  const corpusName = opts.genomeName ?? basename(opts.genomePath, ".fa");

  const allFacts: Fact[] = [...facts];
  let factCounter = facts.length;

  for (let i = 0; i < target.signatures.sites.length; i++) {
    const site = target.signatures.sites[i]!;
    const result = scanSite(site, genome, corpusName, genomeHash, target.tolerance);

    factCounter++;
    const occId = `f${factCounter}`;
    allFacts.push({
      id: occId,
      claim: "site_occurrences",
      subject: {
        site: i,
        corpus: corpusName,
        tolerance: target.tolerance,
      },
      value: result.count,
      grade: { m: "computed", o: "n/a" } as Grade,
      from: [],
      source: genomeHash,
    });

    // Inference: sequence unique in host
    if (result.count === 0) {
      factCounter++;
      allFacts.push({
        id: `f${factCounter}`,
        claim: "unique_in_host",
        subject: { site: i },
        value: true,
        grade: { m: "inferred", o: "same" } as Grade,
        from: [occId],
        note: "reference genome stands in for the individual",
      });
    }
  }

  // Near-match scan (for UNKNOWN section)
  const nearMatches: { tolerance: number; count: number }[] = [];
  if (target.tolerance < 3) {
    for (let tol = target.tolerance + 1; tol <= 3; tol++) {
      let totalHits = 0;
      for (const site of target.signatures.sites) {
        const result = scanSite(site, genome, corpusName, genomeHash, tol);
        totalHits += result.count;
      }
      if (totalHits > 0) {
        nearMatches.push({ tolerance: tol, count: totalHits });
      }
    }
  }

  // Pass 3: judge
  const outcome: OutcomeDistribution = {
    status: "unknown",
    space: [...EXCISE_OUTCOMES],
  };

  const assertions = judge(target, allFacts, outcome);
  const hasRefusal = assertions.some((a) => a.status === "refused");

  const lock: Lock = {
    [corpusName]: genomeHash,
    ...Object.fromEntries(
      Object.entries(vocabVersions).map(([source, version]) => [
        `vocab:${source}`, version,
      ]),
    ),
  };

  const manifest = writeManifest(target, allFacts, assertions, outcome, lock, target.tolerance, nearMatches);

  const ir: IR = {
    locus_ir: "0.1",
    target,
    intent,
    facts: allFacts,
    assertions,
    outcome_distribution: outcome,
    lock,
  };

  return {
    exitCode: hasRefusal ? 1 : 0,
    manifest,
    ir,
  };
}
