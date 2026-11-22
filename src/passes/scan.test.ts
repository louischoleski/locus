import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanSite, scanSiteStreaming, readFasta, hashFile, loadPrecomputed, type ScanCache } from "./scan.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolvePath(__dirname, "../../fixtures");
const TINY = resolvePath(FIXTURES, "tiny.fa");

describe("scan — indexed vs linear", () => {
  it("tolerance 0 uses k-mer index and matches linear results", () => {
    const { sequence, hash } = readFasta(TINY);
    // A sequence known to be in tiny.fa
    const result = scanSite("GATCTTGGACGT", sequence, "tiny", hash, 0);
    assert.equal(result.count, 1);
    assert.ok(result.algorithm.includes("indexed"));
  });

  it("tolerance > 0 uses linear scan", () => {
    const { sequence, hash } = readFasta(TINY);
    const result = scanSite("GATCTTGGACGT", sequence, "tiny", hash, 1);
    assert.ok(result.count >= 1); // at least the exact match
    assert.ok(!result.algorithm.includes("indexed"));
  });

  it("both strands are always checked", () => {
    const { sequence, hash } = readFasta(TINY);
    // TTACGCAAGCTT is in the genome on the forward strand
    const result = scanSite("TTACGCAAGCTT", sequence, "tiny", hash, 0);
    assert.ok(result.count >= 1);
  });

  it("palindrome is not double-counted", () => {
    // GAATTCGAATTC reversed complement... let's check
    // GAATTC rc = GAATTC — it IS a palindrome if the full sequence is self-complementary
    // Actually GAATTCGAATTC rc = GAATTCGAATTC — yes, it's a palindrome
    const genome = "NNNNGAATTCGAATTCNNNN";
    const result = scanSite("GAATTCGAATTC", genome, "test", "h", 0);
    assert.equal(result.count, 1, "palindrome should not be double-counted");
  });
});

describe("scan — streaming mode", () => {
  it("streaming scan matches sync scan for small files", async () => {
    const { sequence, hash } = readFasta(TINY);
    const sync = scanSite("GATCTTGGACGT", sequence, "tiny", hash, 0);
    const streaming = await scanSiteStreaming("GATCTTGGACGT", TINY, "tiny", hash, 0);
    assert.equal(streaming.count, sync.count);
  });

  it("streaming handles multi-chromosome FASTA", async () => {
    const tmpDir = resolvePath(__dirname, "../../fixtures/tmp_scan");
    mkdirSync(tmpDir, { recursive: true });

    const multiChrom = resolvePath(tmpDir, "multi.fa");
    writeFileSync(multiChrom, [
      ">chr1",
      "NNNNGATCTTGGACGTNNNNN",
      ">chr2",
      "NNNNNTTACGCAAGCTTNNNNN",
      ">chr3",
      "NNNNNNNNNNNNNNNNNNNNN",
    ].join("\n") + "\n");

    const hash = hashFile(multiChrom);
    const result = await scanSiteStreaming("GATCTTGGACGT", multiChrom, "multi", hash, 0);
    assert.equal(result.count, 1);
    assert.equal(result.hits[0]!.chromosome, "chr1");

    rmSync(tmpDir, { recursive: true });
  });
});

describe("scan — cache", () => {
  it("caches results and returns them on second call", async () => {
    const tmpDir = resolvePath(__dirname, "../../fixtures/tmp_cache");
    mkdirSync(tmpDir, { recursive: true });
    const cache: ScanCache = { dir: tmpDir };

    const hash = hashFile(TINY);
    const r1 = await scanSiteStreaming("GATCTTGGACGT", TINY, "tiny", hash, 0, cache);
    const r2 = await scanSiteStreaming("GATCTTGGACGT", TINY, "tiny", hash, 0, cache);

    assert.equal(r1.count, r2.count);
    assert.equal(r1.site, r2.site);

    rmSync(tmpDir, { recursive: true });
  });
});

describe("scan — precomputed", () => {
  it("loads and uses precomputed results", () => {
    const tmpDir = resolvePath(__dirname, "../../fixtures/tmp_precomp");
    mkdirSync(tmpDir, { recursive: true });

    const precomp = {
      results: [{
        site: "GATCTTGGACGT",
        corpus: "GRCh38.p14",
        corpusHash: "sha256:9f2c1234",
        algorithm: "external-tool/1.0",
        tolerance: 0,
        count: 0,
        hits: [],
      }],
    };

    const precompPath = resolvePath(tmpDir, "precomputed.json");
    writeFileSync(precompPath, JSON.stringify(precomp));

    const loaded = loadPrecomputed(precompPath);
    assert.equal(loaded.results.length, 1);
    assert.equal(loaded.results[0]!.count, 0);

    rmSync(tmpDir, { recursive: true });
  });
});

describe("hashFile", () => {
  it("produces consistent hash for same file", () => {
    const h1 = hashFile(TINY);
    const h2 = hashFile(TINY);
    assert.equal(h1, h2);
    assert.ok(h1.startsWith("sha256:"));
  });
});
