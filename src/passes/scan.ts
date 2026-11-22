/**
 * FASTA scanner — counts occurrences of each site in a reference genome.
 *
 * Rules from the spec:
 * - Both strands, always.
 * - Ambiguity codes expand in the query only.
 * - Overlapping matches all count.
 * - Bulges are not searched (substitutions only).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export interface Hit {
  position: number;
  strand: "+" | "-";
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
 * Find all occurrences of a query on one strand of a genome,
 * allowing up to `tolerance` mismatches (substitutions only).
 */
function findHits(query: string, genome: string, tolerance: number, strand: "+" | "-"): Hit[] {
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
      hits.push({ position: i, strand });
    }
  }
  return hits;
}

/** Read a FASTA file and return the concatenated sequence (uppercase, no headers). */
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
  const fwdHits = findHits(site, genome, tolerance, "+");
  const rc = revcomp(site);
  // Avoid double-counting palindromes
  const revHits = rc === site ? [] : findHits(rc, genome, tolerance, "-");
  const allHits = [...fwdHits, ...revHits];

  return {
    site,
    corpus: corpusName,
    corpusHash,
    algorithm: "locus-scan/0.1   substitutions only, both strands",
    tolerance,
    count: allHits.length,
    hits: allHits,
  };
}
