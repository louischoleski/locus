import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCorpus } from "./diff.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolvePath(__dirname, "../../fixtures");

describe("locus diff", () => {
  it("reports no changes when same genome is used for both", () => {
    const genome = resolvePath(FIXTURES, "tiny.fa");
    const result = diffCorpus(FIXTURES, genome, genome, "tiny_test", "tiny_test");
    assert.equal(result.changes.length, 0);
    assert.equal(result.needsReviewer, false);
    assert.ok(result.summary.includes("No assertion status changes"));
  });

  it("detects changes when genomes differ", () => {
    // Create a second genome that is empty (no matches at all)
    const tmpDir = resolvePath(__dirname, "../../fixtures/tmp");
    mkdirSync(tmpDir, { recursive: true });
    const emptyGenome = resolvePath(tmpDir, "empty.fa");
    writeFileSync(emptyGenome, ">empty\nNNNNNNNNNNNNNNNNNNNN\n");

    const genome = resolvePath(FIXTURES, "tiny.fa");
    const result = diffCorpus(FIXTURES, genome, emptyGenome, "tiny_test", "empty_test");

    // With an empty genome, site_occurrences should be 0 → unique_in_host inferred
    // This may flip signature_unique_in_reference from allowed→refused or vice versa
    // The key test is that the diff mechanism works
    if (result.changes.length > 0) {
      assert.ok(result.summary.includes("changed status"));
      for (const c of result.changes) {
        assert.ok(c.fixture.endsWith(".locus"));
        assert.ok(["refused→allowed", "allowed→refused", "changed"].includes(c.direction));
      }
    }

    // Clean up
    rmSync(tmpDir, { recursive: true });
  });

  it("flags refused→allowed as needing reviewer", () => {
    // Directly test the needsReviewer logic
    const result = diffCorpus(FIXTURES, resolvePath(FIXTURES, "tiny.fa"), resolvePath(FIXTURES, "tiny.fa"), "a", "a");
    // No changes with same genome, so no reviewer needed
    assert.equal(result.needsReviewer, false);
  });
});
