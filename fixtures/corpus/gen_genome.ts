/**
 * Generate a synthetic test genome for the corpus.
 *
 * Plants specific guide sequences at known positions within random
 * genomic background. This gives deterministic scan results for fixtures.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Deterministic pseudo-random generator (xorshift32)
let seed = 42;
function rand(): number {
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

function randBase(): string {
  const bases = "ACGT";
  return bases[Math.floor(rand() * 4)]!;
}

function randSeq(len: number): string {
  return Array.from({ length: len }, () => randBase()).join("");
}

// Planted sequences — these will appear exactly once in the genome
// unless noted otherwise. Guides for CRISPR studies are typically 20-23nt.
const PLANTED_SITES: Record<string, { seq: string; positions: number[]; note: string }> = {
  // HSV-2 latent — dual guide (from spec example)
  hsv2_guide1:   { seq: "GATCTTGGACGT", positions: [50000], note: "HSV-2 guide 1" },
  hsv2_guide2:   { seq: "TTACGCAAGCTT", positions: [52000], note: "HSV-2 guide 2" },

  // HBV cccDNA targets
  hbv_guide1:    { seq: "ACCGTAGCTAACGATCG", positions: [100000], note: "HBV cccDNA guide 1" },
  hbv_guide2:    { seq: "TGCAATCGGTACCTGAA", positions: [100500], note: "HBV cccDNA guide 2" },

  // EBV latent targets
  ebv_guide1:    { seq: "GCTAGTCAACGATCCTG", positions: [150000], note: "EBV EBNA1 guide" },

  // HIV provirus
  hiv_guide1:    { seq: "ATCCAGTGCTAGCTTGA", positions: [200000], note: "HIV LTR guide 1" },
  hiv_guide2:    { seq: "TGACCGTAACTGCAATC", positions: [200800], note: "HIV LTR guide 2" },

  // HPV E6/E7 oncogene
  hpv_guide1:    { seq: "GACCTGTTAGCAATCCG", positions: [250000], note: "HPV16 E6 guide" },

  // DMD exon skip
  dmd_guide1:    { seq: "CTGAAGTCGATCCTAAG", positions: [300000], note: "DMD exon 51 guide" },

  // SCD / sickle cell BCL11A enhancer
  scd_guide1:    { seq: "TCAAGGTCCTAAGCGAT", positions: [350000], note: "BCL11A enhancer guide" },

  // TTR amyloidosis
  ttr_guide1:    { seq: "AGCTTAGCAATCGGTAC", positions: [400000], note: "TTR exon guide" },

  // PCSK9 (cholesterol)
  pcsk9_guide1:  { seq: "GTACCGATCTTGAACGT", positions: [450000], note: "PCSK9 guide" },

  // Retinal — RPE65
  rpe65_guide1:  { seq: "CAGTCAACGTAGCTAAC", positions: [500000], note: "RPE65 guide" },

  // Retinal — CEP290 intron
  cep290_guide1: { seq: "TGCAATCCTGAAGTAGC", positions: [550000], note: "CEP290 IVS26 guide" },

  // Huntington HTT
  htt_guide1:    { seq: "GCTAGCAATCGTACCGA", positions: [600000], note: "HTT exon 1 guide" },
  htt_guide2:    { seq: "TGACCCTAAGTCGATCG", positions: [600500], note: "HTT exon 1 guide 2" },

  // Leber — GUCY2D
  gucy2d_guide1: { seq: "ATCCGTAGCTAACGATC", positions: [650000], note: "GUCY2D guide" },

  // Hemophilia B — FIX
  fix_guide1:    { seq: "CAATCGGTACCTGAAGT", positions: [700000], note: "F9 guide" },

  // Alpha-1 antitrypsin — SERPINA1
  a1at_guide1:   { seq: "TGAAGCTTAGCAATCGG", positions: [750000], note: "SERPINA1 guide" },

  // Near-miss: appears with 1 mismatch to hsv2_guide1
  nearmiss1:     { seq: "GATCTTGGACGA", positions: [55000], note: "1-mismatch near-miss to hsv2_guide1" },

  // Multi-hit: appears at multiple positions (non-unique — for failure fixtures)
  multihit:      { seq: "ACGTACGTACGT", positions: [800000, 810000, 820000], note: "non-unique site" },

  // Self-complementary palindrome
  palindrome:    { seq: "GAATTCGAATTC", positions: [850000], note: "EcoRI palindrome — tests both-strand scanning" },
};

function main() {
  const GENOME_SIZE = 1_000_000;
  const genome = Array.from({ length: GENOME_SIZE }, () => randBase());

  // Plant sites at specified positions
  for (const [name, info] of Object.entries(PLANTED_SITES)) {
    for (const pos of info.positions) {
      if (pos + info.seq.length > GENOME_SIZE) {
        console.error(`WARNING: ${name} at ${pos} exceeds genome size`);
        continue;
      }
      for (let i = 0; i < info.seq.length; i++) {
        genome[pos + i] = info.seq[i]!;
      }
    }
  }

  // Format as FASTA
  const lines = [">locus_corpus_v0.1  synthetic test genome for Locus corpus"];
  const seq = genome.join("");
  for (let i = 0; i < seq.length; i += 80) {
    lines.push(seq.slice(i, i + 80));
  }

  const outPath = resolve(__dirname, "corpus_genome.fa");
  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`Wrote ${outPath} (${GENOME_SIZE} bp, ${Object.keys(PLANTED_SITES).length} planted sites)`);

  // Write a manifest of planted sites for reference
  const manifest = Object.entries(PLANTED_SITES)
    .map(([name, info]) => `${name}\t${info.seq}\t${info.positions.join(",")}\t${info.note}`)
    .join("\n");
  writeFileSync(resolve(__dirname, "planted_sites.tsv"), `name\tsequence\tpositions\tnote\n${manifest}\n`);
}

main();
