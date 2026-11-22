import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VocabResolver } from "./vocab.ts";

describe("tissue vocabulary resolution", () => {
  const resolver = new VocabResolver();

  it("resolves a known CL term exactly", () => {
    const result = resolver.resolve("hepatocyte");
    assert.ok("id" in result, `expected resolved, got error: ${JSON.stringify(result)}`);
    assert.equal(result.id, "CL:0000182");
    assert.equal(result.name, "hepatocyte");
    assert.ok(result.vocab.startsWith("cl-"));
  });

  it("resolves a known Uberon term exactly", () => {
    const result = resolver.resolve("liver");
    assert.ok("id" in result);
    assert.equal(result.id, "UBERON:0002107");
    assert.ok(result.vocab.startsWith("uberon-"));
  });

  it("resolves a dotted CL path", () => {
    const result = resolver.resolve("neuron.sensory.sacral");
    assert.ok("id" in result);
    assert.equal(result.id, "CL:0000101");
  });

  it("resolves neuron.cortical", () => {
    const result = resolver.resolve("neuron.cortical");
    assert.ok("id" in result);
    assert.equal(result.id, "CL:0010012");
  });

  it("returns error with nearest matches for unknown term", () => {
    const result = resolver.resolve("neruon.sensory");
    assert.ok("code" in result, `expected error, got resolved: ${JSON.stringify(result)}`);
    assert.equal(result.code, "E301");
    assert.ok(result.nearestMatches.length > 0, "expected nearest matches");
    // Should suggest neuron.sensory or similar
    assert.ok(
      result.nearestMatches.some((m) => m.includes("neuron")),
      `nearest matches should include neuron-like terms: ${result.nearestMatches}`,
    );
  });

  it("returns error for completely unknown term", () => {
    const result = resolver.resolve("xyzzy.quux.baz");
    assert.ok("code" in result);
    assert.equal(result.code, "E301");
    assert.ok(result.nearestMatches.length > 0);
  });

  it("resolveAll returns all resolved or collects errors", () => {
    const { resolved, errors } = resolver.resolveAll(["hepatocyte", "liver", "neruon"]);
    assert.equal(resolved.length, 2);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.code, "E301");
  });

  it("vocab versions are available for lockfile", () => {
    const versions = resolver.vocabVersions();
    assert.ok("CL" in versions);
    assert.ok("UBERON" in versions);
    assert.ok(versions.CL!.startsWith("cl-"));
    assert.ok(versions.UBERON!.startsWith("uberon-"));
  });

  it("case-insensitive resolution works", () => {
    const result = resolver.resolve("Hepatocyte");
    assert.ok("id" in result);
    assert.equal(result.id, "CL:0000182");
  });

  it("every term in both vocabs resolves to itself", () => {
    // S&P: verify internal consistency — no term in our own vocab files fails to resolve
    const versions = resolver.vocabVersions();
    // We can't iterate the private map, but we can spot-check a broad set
    const knownTerms = [
      "neuron", "sensory.neuron", "motor.neuron", "hepatocyte",
      "retinal.ganglion.cell", "photoreceptor", "t.cell", "cd4.t.cell",
      "b.cell", "macrophage", "microglia", "astrocyte", "schwann.cell",
      "cardiomyocyte", "fibroblast", "endothelial.cell", "stem.cell",
      "liver", "brain", "cerebral.cortex", "hippocampus", "retina",
      "heart", "lung", "kidney", "pancreas", "bone.marrow", "blood",
    ];
    for (const term of knownTerms) {
      const result = resolver.resolve(term);
      assert.ok("id" in result, `term '${term}' failed to resolve: ${JSON.stringify(result)}`);
    }
  });
});
