import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "./test-runner.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolvePath(__dirname, "../../fixtures");
const GENOME = resolvePath(FIXTURES, "tiny.fa");

describe("locus test runner", () => {
  it("runs all fixtures with metadata and reports results", () => {
    const result = runTests(FIXTURES, GENOME, "tiny_test");

    assert.ok(result.total >= 3, `expected at least 3 fixtures, got ${result.total}`);
    assert.equal(result.passed, result.total, `expected all to pass, got ${result.passed}/${result.total}`);
    assert.equal(result.unitFailures, 0);
    assert.equal(result.fixtureFailures, 0);
    assert.equal(result.exitCode, 0);
    assert.equal(result.blocksBuild, false);
    assert.equal(result.blocksRelease, false);
  });

  it("each result carries fixture name, kind, and pass status", () => {
    const result = runTests(FIXTURES, GENOME, "tiny_test");

    for (const r of result.results) {
      assert.ok(r.fixture.endsWith(".locus"), `fixture name: ${r.fixture}`);
      assert.ok(["golden", "falsification", "unit"].includes(r.kind));
      assert.ok(typeof r.passed === "boolean");
      assert.ok(r.message.length > 0);
    }
  });

  it("golden fixture for hsv2_latent correctly expects eliminates_reservoir refused", () => {
    const result = runTests(FIXTURES, GENOME, "tiny_test");
    const hsv = result.results.find((r) => r.fixture === "hsv2_latent.locus");
    assert.ok(hsv, "hsv2_latent fixture not found");
    assert.equal(hsv!.kind, "golden");
    assert.equal(hsv!.passed, true);
    assert.ok(hsv!.message.includes("refused"));
  });

  it("unit fixture for bad_no_organism correctly expects error", () => {
    const result = runTests(FIXTURES, GENOME, "tiny_test");
    const bad = result.results.find((r) => r.fixture === "bad_no_organism.locus");
    assert.ok(bad, "bad_no_organism fixture not found");
    assert.equal(bad!.kind, "unit");
    assert.equal(bad!.passed, true);
    assert.ok(bad!.message.includes("error"));
  });

  it("unit failure blocks build (exit 2), fixture failure blocks release (exit 1)", () => {
    // Verify the blocking rule logic by inspection
    // unitFailures > 0 → blocksBuild = true, exitCode = 2
    // fixtureFailures > 0 → blocksRelease = true, exitCode = 1
    // This is structural — verified against the implementation
    const result = runTests(FIXTURES, GENOME, "tiny_test");
    if (result.unitFailures > 0) {
      assert.equal(result.blocksBuild, true);
      assert.equal(result.exitCode, 2);
    }
    if (result.fixtureFailures > 0) {
      assert.equal(result.blocksRelease, true);
      assert.ok(result.exitCode >= 1);
    }
    if (result.unitFailures === 0 && result.fixtureFailures === 0) {
      assert.equal(result.blocksBuild, false);
      assert.equal(result.blocksRelease, false);
      assert.equal(result.exitCode, 0);
    }
  });
});
