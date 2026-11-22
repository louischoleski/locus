import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolvePath(__dirname, "../../fixtures");

function fixture(name: string): string {
  return readFileSync(resolvePath(FIXTURES, name), "utf-8");
}

describe("locus build", () => {
  it("compiles hsv2_latent and refuses eliminates_reservoir", () => {
    const result = build({
      source: fixture("hsv2_latent.locus"),
      genomePath: resolvePath(FIXTURES, "tiny.fa"),
      genomeName: "tiny_test",
    });

    assert.equal(result.exitCode, 1, "expected exit code 1 (refused)");
    assert.ok(result.manifest, "expected a manifest");
    assert.ok(result.ir, "expected IR");

    // Should have site_occurrences facts
    const occFacts = result.ir!.facts.filter((f) => f.claim === "site_occurrences");
    assert.equal(occFacts.length, 2, "expected 2 site_occurrences facts (one per site)");

    // Both sites should be found (count = 1 each in the tiny genome)
    for (const f of occFacts) {
      assert.equal(f.value, 1, `expected 1 occurrence, got ${f.value}`);
      assert.equal(f.grade.m, "computed");
      assert.equal(f.grade.o, "n/a");
    }

    // Should have unique_in_host facts? No — count is 1, not 0
    const hostFacts = result.ir!.facts.filter((f) => f.claim === "unique_in_host");
    assert.equal(hostFacts.length, 0, "count is 1, not 0 — no unique_in_host inference");

    // eliminates_reservoir must be refused
    const elim = result.ir!.assertions.find((a) => a.name === "eliminates_reservoir");
    assert.ok(elim, "expected eliminates_reservoir assertion");
    assert.equal(elim!.status, "refused");
    assert.ok(elim!.reasons.length > 0);

    // Manifest should contain key sections
    assert.ok(result.manifest!.includes("FACTS"));
    assert.ok(result.manifest!.includes("ASSERTIONS"));
    assert.ok(result.manifest!.includes("UNKNOWN"));
    assert.ok(result.manifest!.includes("LOCK"));
    assert.ok(result.manifest!.includes("outcome distribution for excise"));
    assert.ok(result.manifest!.includes("off-target analysis not performed"));
  });

  it("compiles single_site with tolerance 1", () => {
    const result = build({
      source: fixture("single_site.locus"),
      genomePath: resolvePath(FIXTURES, "tiny.fa"),
      genomeName: "tiny_test",
    });

    assert.equal(result.exitCode, 1, "expected exit code 1 (some refused)");
    assert.ok(result.manifest);
    assert.ok(result.ir);

    // Single site with tolerance 1 — may find matches
    const occFacts = result.ir!.facts.filter((f) => f.claim === "site_occurrences");
    assert.equal(occFacts.length, 1);
  });

  it("rejects bad_no_organism with error E201", () => {
    const result = build({
      source: fixture("bad_no_organism.locus"),
      genomePath: resolvePath(FIXTURES, "tiny.fa"),
    });

    assert.equal(result.exitCode, 2, "expected exit code 2 (error)");
    assert.ok(result.errors, "expected errors");
    assert.ok(
      result.errors!.some((e) => e.code === "E201"),
      `expected E201 (organism mandatory), got: ${JSON.stringify(result.errors)}`,
    );
  });
});
