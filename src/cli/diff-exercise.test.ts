import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCorpus } from "./diff.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolvePath(__dirname, "../../fixtures/corpus");

describe("diff exercise — corpus_genome vs corpus_genome_v2", () => {
  it("detects at least one assertion change when hsv2_guide1 is removed", () => {
    const genomeA = resolvePath(CORPUS, "corpus_genome.fa");
    const genomeB = resolvePath(CORPUS, "corpus_genome_v2.fa");

    const result = diffCorpus(
      CORPUS,
      genomeA,
      genomeB,
      "corpus_v0.1",
      "corpus_v0.2",
    );

    // The v2 genome has hsv2_guide1 replaced with Ns, so fixtures that
    // rely on that site (hsv2_dual, hsv2_strict) should produce different
    // scan results and potentially flip assertion statuses.
    assert.ok(result.changes.length > 0, "expected at least one assertion change");
    assert.ok(
      result.summary.includes("changed status"),
      "summary should mention changed status",
    );

    // Every change entry should be well-formed
    for (const c of result.changes) {
      assert.ok(c.fixture.endsWith(".locus"), `fixture should be a .locus file: ${c.fixture}`);
      assert.ok(c.assertion.length > 0, "assertion name should be non-empty");
      assert.ok(c.statusA.length > 0, "statusA should be non-empty");
      assert.ok(c.statusB.length > 0, "statusB should be non-empty");
      assert.ok(
        ["refused→allowed", "allowed→refused", "changed"].includes(c.direction),
        `unexpected direction: ${c.direction}`,
      );
    }
  });

  it("reports no changes when same genome is used twice", () => {
    const genome = resolvePath(CORPUS, "corpus_genome.fa");
    const result = diffCorpus(CORPUS, genome, genome, "corpus_v0.1", "corpus_v0.1");
    assert.equal(result.changes.length, 0);
    assert.ok(result.summary.includes("No assertion status changes"));
  });
});
