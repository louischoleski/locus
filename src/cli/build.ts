/**
 * locus build — the full pipeline: resolve → scan → judge → manifest.
 *
 * Supports two scan modes:
 * - Small genomes: synchronous in-memory scan (default)
 * - Large genomes: streaming scan with optional cache (--scan-cache)
 * - Precomputed: skip scanning, use results from a JSON file (--precomputed)
 */

import { readFileSync, statSync } from "node:fs";
import { resolve as resolvePath, basename } from "node:path";
import { resolve } from "../passes/resolve.ts";
import {
  scanSite, scanSiteStreaming, readFasta, hashFile,
  loadPrecomputed, type ScanResult, type ScanCache,
} from "../passes/scan.ts";
import { judge } from "../passes/judge.ts";
import { writeManifest } from "../passes/manifest.ts";
import { resolveOrganismAxis } from "../registry/organism.ts";
import { effectiveGrade, type Fact, type Grade } from "../ir/grade.ts";
import { capGradeForExtraction, type ExtractionProvenance } from "../registry/provenance.ts";
import type { IR, OutcomeDistribution, Lock } from "../ir/types.ts";
import { EXCISE_OUTCOMES } from "../ir/types.ts";

/** Threshold above which we use streaming scan (500MB). */
const STREAMING_THRESHOLD = 500 * 1024 * 1024;

export interface BuildOptions {
  source: string;
  genomePath: string;
  genomeName?: string;
  json?: boolean;
  scanCacheDir?: string;
  precomputedPath?: string;
  externalFactsPath?: string;
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

  // Cap grades for unreviewed extraction provenance
  for (const fact of facts) {
    if (fact.provenance && fact.provenance.reviewer === null) {
      fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);
    }
  }

  // Determine scan mode
  const fileSize = statSync(opts.genomePath).size;
  const isLarge = fileSize > STREAMING_THRESHOLD;
  const corpusName = opts.genomeName ?? basename(opts.genomePath, ".fa");

  let genomeHash: string;
  let genome: string | null = null;
  let precomputed: Map<string, ScanResult> | null = null;
  let cache: ScanCache | undefined;

  if (opts.precomputedPath) {
    // Precomputed mode
    const pc = loadPrecomputed(opts.precomputedPath);
    precomputed = new Map(pc.results.map((r) => [`${r.site}:${r.tolerance}`, r]));
    genomeHash = pc.results[0]?.corpusHash ?? hashFile(opts.genomePath);
  } else if (isLarge) {
    // Streaming mode for large genomes
    genomeHash = hashFile(opts.genomePath);
    if (opts.scanCacheDir) {
      cache = { dir: opts.scanCacheDir };
    }
  } else {
    // In-memory mode for small genomes
    const fasta = readFasta(opts.genomePath);
    genome = fasta.sequence;
    genomeHash = fasta.hash;
  }

  // Pass 2: scan
  const allFacts: Fact[] = [...facts];
  let factCounter = facts.length;

  // For streaming mode, we need async — but we keep the sync API for backward compat.
  // If streaming is needed, we do it synchronously via a wrapper.
  for (let i = 0; i < target.signatures.sites.length; i++) {
    const site = target.signatures.sites[i]!;
    let result: ScanResult;

    if (precomputed) {
      const key = `${site}:${target.tolerance}`;
      result = precomputed.get(key) ?? {
        site, corpus: corpusName, corpusHash: genomeHash,
        algorithm: "precomputed", tolerance: target.tolerance,
        count: -1, hits: [],
      };
      if (result.count === -1) {
        return {
          exitCode: 2,
          errors: [{ code: "E500", message: `no precomputed result for site '${site}' at tolerance ${target.tolerance}` }],
        };
      }
    } else if (genome !== null) {
      result = scanSite(site, genome, corpusName, genomeHash, target.tolerance);
    } else {
      // Large genome — can't use async in sync context, fall back to sync read per chromosome
      // This is the compromise: for truly huge genomes, users should use --scan-cache
      // or --precomputed. For moderately large genomes (~500MB-2GB), this still works.
      const fasta = readFasta(opts.genomePath);
      genome = fasta.sequence;
      result = scanSite(site, genome, corpusName, genomeHash, target.tolerance);
    }

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
        let result: ScanResult;
        if (precomputed) {
          result = precomputed.get(`${site}:${tol}`) ?? {
            site, corpus: corpusName, corpusHash: genomeHash,
            algorithm: "precomputed", tolerance: tol, count: 0, hits: [],
          };
        } else {
          result = scanSite(site, genome!, corpusName, genomeHash, tol);
        }
        totalHits += result.count;
      }
      if (totalHits > 0) {
        nearMatches.push({ tolerance: tol, count: totalHits });
      }
    }
  }

  // Load external facts if provided
  let outcome: OutcomeDistribution = {
    status: "unknown",
    space: [...EXCISE_OUTCOMES],
  };

  if (opts.externalFactsPath) {
    const external = JSON.parse(readFileSync(opts.externalFactsPath, "utf-8"));
    if (Array.isArray(external.facts)) {
      for (const f of external.facts as Fact[]) {
        factCounter++;
        allFacts.push({ ...f, id: f.id ?? `f_ext${factCounter}` });
      }
    }
    if (external.outcome_distribution) {
      outcome = external.outcome_distribution;
    }
  }

  // Pass 3: judge
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

// --- Async build for truly large genomes ---

export async function buildAsync(opts: BuildOptions): Promise<BuildResult> {
  const resolved = resolve(opts.source);
  if (!("target" in resolved)) {
    return { exitCode: 2, errors: resolved.errors };
  }

  const { target, intent, facts, vocabVersions } = resolved;

  for (const fact of facts) {
    if (fact.grade.o !== "n/a" && fact.grade.o !== "unknown") {
      fact.grade = { ...fact.grade, o: resolveOrganismAxis(fact.grade.o, target.organism) };
    }
  }

  // Cap grades for unreviewed extraction provenance
  for (const fact of facts) {
    if (fact.provenance && fact.provenance.reviewer === null) {
      fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);
    }
  }

  const corpusName = opts.genomeName ?? basename(opts.genomePath, ".fa");
  const genomeHash = hashFile(opts.genomePath);
  const cache: ScanCache | undefined = opts.scanCacheDir ? { dir: opts.scanCacheDir } : undefined;

  const allFacts: Fact[] = [...facts];
  let factCounter = facts.length;

  for (let i = 0; i < target.signatures.sites.length; i++) {
    const site = target.signatures.sites[i]!;
    const result = await scanSiteStreaming(site, opts.genomePath, corpusName, genomeHash, target.tolerance, cache);

    factCounter++;
    const occId = `f${factCounter}`;
    allFacts.push({
      id: occId,
      claim: "site_occurrences",
      subject: { site: i, corpus: corpusName, tolerance: target.tolerance },
      value: result.count,
      grade: { m: "computed", o: "n/a" } as Grade,
      from: [],
      source: genomeHash,
    });

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

  // Near-matches
  const nearMatches: { tolerance: number; count: number }[] = [];
  if (target.tolerance < 3) {
    for (let tol = target.tolerance + 1; tol <= 3; tol++) {
      let totalHits = 0;
      for (const site of target.signatures.sites) {
        const result = await scanSiteStreaming(site, opts.genomePath, corpusName, genomeHash, tol, cache);
        totalHits += result.count;
      }
      if (totalHits > 0) {
        nearMatches.push({ tolerance: tol, count: totalHits });
      }
    }
  }

  const outcome: OutcomeDistribution = { status: "unknown", space: [...EXCISE_OUTCOMES] };
  const assertions = judge(target, allFacts, outcome);
  const hasRefusal = assertions.some((a) => a.status === "refused");

  const lock: Lock = {
    [corpusName]: genomeHash,
    ...Object.fromEntries(
      Object.entries(vocabVersions).map(([source, version]) => [`vocab:${source}`, version]),
    ),
  };

  const manifest = writeManifest(target, allFacts, assertions, outcome, lock, target.tolerance, nearMatches);
  const ir: IR = { locus_ir: "0.1", target, intent, facts: allFacts, assertions, outcome_distribution: outcome, lock };

  return { exitCode: hasRefusal ? 1 : 0, manifest, ir };
}
