/**
 * FASTA scanner — counts occurrences of each site in a reference genome.
 *
 * Rules from the spec:
 * - Both strands, always.
 * - Ambiguity codes expand in the query only.
 * - Overlapping matches all count.
 * - Bulges are not searched (substitutions only).
 *
 * Supports two modes:
 * - Small genomes: load into memory (original path)
 * - Large genomes: stream by chromosome, k-mer index for tol=0, linear for tol>0
 *
 * Scan cache: results keyed by (corpus hash, site, tolerance) to avoid re-scanning.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream, statSync, openSync, readSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { createInterface } from "node:readline";

export interface Hit {
  position: number;
  strand: "+" | "-";
  chromosome?: string;
}

export interface ScanResult {
  site: string;
  corpus: string;
  corpusHash: string;
  algorithm: string;
  tolerance: number;
  count: number;
  hits: Hit[];
}

/** IUPAC ambiguity code expansion. */
const IUPAC_EXPAND: Record<string, string> = {
  A: "A", C: "C", G: "G", T: "T",
  R: "AG", Y: "CT", S: "GC", W: "AT",
  K: "GT", M: "AC", B: "CGT", D: "AGT",
  H: "ACT", V: "ACG", N: "ACGT",
};

/** Reverse complement a sequence. */
function revcomp(seq: string): string {
  const comp: Record<string, string> = {
    A: "T", T: "A", C: "G", G: "C",
    R: "Y", Y: "R", S: "S", W: "W",
    K: "M", M: "K", B: "V", V: "B",
    D: "H", H: "D", N: "N",
  };
  return seq.split("").reverse().map((c) => comp[c] ?? "N").join("");
}

/** Check if a query has IUPAC ambiguity codes (not just ACGT). */
function hasAmbiguity(seq: string): boolean {
  return /[^ACGT]/.test(seq);
}

/**
 * Check if query base matches genome base at a given mismatch cost.
 * Query IUPAC codes expand (match any base in set at no cost).
 * Genome ambiguity codes count as mismatch unless identical to query.
 */
function basesMatch(queryBase: string, genomeBase: string): boolean {
  const expanded = IUPAC_EXPAND[queryBase];
  if (!expanded) return false;
  return expanded.includes(genomeBase);
}

/**
 * Find all occurrences of a query on one strand of a sequence,
 * allowing up to `tolerance` mismatches (substitutions only).
 */
function findHits(query: string, genome: string, tolerance: number, strand: "+" | "-", offset: number = 0, chrom?: string): Hit[] {
  const hits: Hit[] = [];
  const qlen = query.length;
  const glen = genome.length;

  for (let i = 0; i <= glen - qlen; i++) {
    let mismatches = 0;
    let matched = true;
    for (let j = 0; j < qlen; j++) {
      if (!basesMatch(query[j]!, genome[i + j]!)) {
        mismatches++;
        if (mismatches > tolerance) {
          matched = false;
          break;
        }
      }
    }
    if (matched) {
      hits.push({ position: offset + i, strand, chromosome: chrom });
    }
  }
  return hits;
}

/**
 * K-mer hash index for exact matching (tolerance 0, no ambiguity).
 * Maps each k-mer to its positions in the sequence.
 */
function buildKmerIndex(genome: string, k: number): Map<string, number[]> {
  const index = new Map<string, number[]>();
  const glen = genome.length;
  for (let i = 0; i <= glen - k; i++) {
    const kmer = genome.substring(i, i + k);
    // Skip k-mers containing N or other ambiguity
    if (/[^ACGT]/.test(kmer)) continue;
    let positions = index.get(kmer);
    if (!positions) {
      positions = [];
      index.set(kmer, positions);
    }
    positions.push(i);
  }
  return index;
}

/**
 * Find exact matches using the k-mer index (tolerance 0, no query ambiguity).
 */
function findHitsIndexed(query: string, index: Map<string, number[]>, strand: "+" | "-", offset: number = 0, chrom?: string): Hit[] {
  const positions = index.get(query);
  if (!positions) return [];
  return positions.map((p) => ({ position: offset + p, strand, chromosome: chrom }));
}

// --- Scan cache ---

export interface ScanCache {
  dir: string;
}

function cacheKey(corpusHash: string, site: string, tolerance: number): string {
  const h = createHash("sha256").update(`${corpusHash}:${site}:${tolerance}`).digest("hex").slice(0, 16);
  return h;
}

function cacheGet(cache: ScanCache, corpusHash: string, site: string, tolerance: number): ScanResult | null {
  const key = cacheKey(corpusHash, site, tolerance);
  const path = resolvePath(cache.dir, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function cachePut(cache: ScanCache, corpusHash: string, site: string, tolerance: number, result: ScanResult): void {
  mkdirSync(cache.dir, { recursive: true });
  const key = cacheKey(corpusHash, site, tolerance);
  writeFileSync(resolvePath(cache.dir, `${key}.json`), JSON.stringify(result));
}

// --- FASTA reading ---

/** Hash a file (handles multi-GB via fingerprint for large files). */
export function hashFile(path: string): string {
  const stats = statSync(path);
  if (stats.size < 100 * 1024 * 1024) {
    const raw = readFileSync(path);
    return "sha256:" + createHash("sha256").update(raw).digest("hex").slice(0, 8);
  }
  // For large files, hash first 1MB + size as a fingerprint
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(1024 * 1024);
  const bytesRead = readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  return "sha256:" + createHash("sha256")
    .update(buf.subarray(0, bytesRead))
    .update(`:${stats.size}`)
    .digest("hex")
    .slice(0, 8);
}

/** Read a small FASTA file into memory. For files under ~500MB. */
export function readFasta(path: string): { sequence: string; hash: string } {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n");
  const seqLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(">")) continue;
    seqLines.push(line.trim().toUpperCase());
  }
  const sequence = seqLines.join("");
  const hash = "sha256:" + createHash("sha256").update(raw).digest("hex").slice(0, 8);
  return { sequence, hash };
}

/**
 * Iterate over chromosomes in a FASTA file, yielding one at a time.
 * Memory-efficient: only holds one chromosome in memory.
 */
export async function* iterChromosomes(path: string): AsyncGenerator<{ name: string; sequence: string }> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let currentName: string | null = null;
  let chunks: string[] = [];

  for await (const line of rl) {
    if (line.startsWith(">")) {
      if (currentName !== null) {
        yield { name: currentName, sequence: chunks.join("") };
      }
      currentName = line.slice(1).split(/\s/)[0] ?? "unknown";
      chunks = [];
    } else {
      chunks.push(line.trim().toUpperCase());
    }
  }

  if (currentName !== null) {
    yield { name: currentName, sequence: chunks.join("") };
  }
}

/**
 * Scan a site across all chromosomes in a FASTA file.
 * Streams by chromosome — never loads the whole genome at once.
 * Uses k-mer index for tolerance 0 without ambiguity; linear scan otherwise.
 */
export async function scanSiteStreaming(
  site: string,
  fastaPath: string,
  corpusName: string,
  corpusHash: string,
  tolerance: number,
  cache?: ScanCache,
): Promise<ScanResult> {
  // Check cache first
  if (cache) {
    const cached = cacheGet(cache, corpusHash, site, tolerance);
    if (cached) return cached;
  }

  const rc = revcomp(site);
  const isPalindrome = rc === site;
  const useIndex = tolerance === 0 && !hasAmbiguity(site);
  const allHits: Hit[] = [];

  for await (const chrom of iterChromosomes(fastaPath)) {
    if (useIndex) {
      const index = buildKmerIndex(chrom.sequence, site.length);
      allHits.push(...findHitsIndexed(site, index, "+", 0, chrom.name));
      if (!isPalindrome) {
        allHits.push(...findHitsIndexed(rc, index, "-", 0, chrom.name));
      }
    } else {
      allHits.push(...findHits(site, chrom.sequence, tolerance, "+", 0, chrom.name));
      if (!isPalindrome) {
        allHits.push(...findHits(rc, chrom.sequence, tolerance, "-", 0, chrom.name));
      }
    }
  }

  const result: ScanResult = {
    site,
    corpus: corpusName,
    corpusHash,
    algorithm: `locus-scan/0.2   substitutions only, both strands${useIndex ? ", indexed" : ""}`,
    tolerance,
    count: allHits.length,
    hits: allHits,
  };

  if (cache) {
    cachePut(cache, corpusHash, site, tolerance, result);
  }

  return result;
}

// --- Synchronous API (backward compat for small genomes + tests) ---

/**
 * Scan a genome for occurrences of a site at the given tolerance.
 * Checks both strands (forward + reverse complement).
 */
export function scanSite(
  site: string,
  genome: string,
  corpusName: string,
  corpusHash: string,
  tolerance: number,
): ScanResult {
  const useIndex = tolerance === 0 && !hasAmbiguity(site);
  let fwdHits: Hit[];
  let revHits: Hit[];

  if (useIndex) {
    const index = buildKmerIndex(genome, site.length);
    fwdHits = findHitsIndexed(site, index, "+");
    const rc = revcomp(site);
    revHits = rc === site ? [] : findHitsIndexed(rc, index, "-");
  } else {
    fwdHits = findHits(site, genome, tolerance, "+");
    const rc = revcomp(site);
    revHits = rc === site ? [] : findHits(rc, genome, tolerance, "-");
  }

  const allHits = [...fwdHits, ...revHits];

  return {
    site,
    corpus: corpusName,
    corpusHash,
    algorithm: `locus-scan/0.2   substitutions only, both strands${useIndex ? ", indexed" : ""}`,
    tolerance,
    count: allHits.length,
    hits: allHits,
  };
}

// --- Precomputed results ---

export interface PrecomputedScan {
  results: ScanResult[];
}

/** Load precomputed scan results from a JSON file. */
export function loadPrecomputed(path: string): PrecomputedScan {
  return JSON.parse(readFileSync(path, "utf-8"));
}
