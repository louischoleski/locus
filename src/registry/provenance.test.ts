import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capGradeForExtraction, validateProvenance, type ExtractionProvenance } from "./provenance.ts";
import type { Grade } from "../ir/grade.ts";

const reviewedProv: ExtractionProvenance = {
  model: "gpt-4o",
  model_version: "2024-08-06",
  prompt_hash: "sha256:abc123",
  extraction_date: "2026-11-22",
  source_id: "doi:10.1234/test",
  source_span: { start: 100, end: 250 },
  reviewer: "mk",
};

const unreviewedProv: ExtractionProvenance = {
  ...reviewedProv,
  reviewer: null,
};

describe("extraction provenance — grade capping", () => {
  it("reviewed: computed passes through unchanged", () => {
    const g: Grade = { m: "computed", o: "same" };
    assert.deepEqual(capGradeForExtraction(g, reviewedProv), { m: "computed", o: "same" });
  });

  it("reviewed: measured passes through unchanged", () => {
    const g: Grade = { m: "measured", o: "related" };
    assert.deepEqual(capGradeForExtraction(g, reviewedProv), { m: "measured", o: "related" });
  });

  it("unreviewed: computed is capped to inferred", () => {
    const g: Grade = { m: "computed", o: "same" };
    const result = capGradeForExtraction(g, unreviewedProv);
    assert.equal(result.m, "inferred");
    assert.equal(result.o, "same"); // organism axis untouched
  });

  it("unreviewed: measured is capped to inferred", () => {
    const g: Grade = { m: "measured", o: "n/a" };
    const result = capGradeForExtraction(g, unreviewedProv);
    assert.equal(result.m, "inferred");
    assert.equal(result.o, "n/a"); // organism axis untouched
  });

  it("unreviewed: inferred passes through (already at cap)", () => {
    const g: Grade = { m: "inferred", o: "same" };
    const result = capGradeForExtraction(g, unreviewedProv);
    assert.equal(result.m, "inferred");
  });

  it("unreviewed: asserted passes through (weaker than cap)", () => {
    const g: Grade = { m: "asserted", o: "same" };
    const result = capGradeForExtraction(g, unreviewedProv);
    assert.equal(result.m, "asserted");
  });

  it("unreviewed: unknown passes through (weakest)", () => {
    const g: Grade = { m: "unknown", o: "unknown" };
    const result = capGradeForExtraction(g, unreviewedProv);
    assert.equal(result.m, "unknown");
  });

  it("organism axis is NEVER affected by review status", () => {
    const organisms = ["n/a", "same", "related", "distant", "unknown"] as const;
    for (const o of organisms) {
      const g: Grade = { m: "computed", o };
      const capped = capGradeForExtraction(g, unreviewedProv);
      assert.equal(capped.o, o, `organism axis changed for ${o}`);
    }
  });
});

describe("extraction provenance — validation", () => {
  it("valid provenance produces no errors", () => {
    assert.deepEqual(validateProvenance(reviewedProv), []);
  });

  it("valid unreviewed provenance produces no errors", () => {
    assert.deepEqual(validateProvenance(unreviewedProv), []);
  });

  it("missing model field is an error", () => {
    const bad = { ...reviewedProv };
    delete (bad as Record<string, unknown>).model;
    const errors = validateProvenance(bad);
    assert.ok(errors.some((e) => e.includes("model")));
  });

  it("missing prompt_hash is an error", () => {
    const bad = { ...reviewedProv, prompt_hash: "" };
    const errors = validateProvenance(bad);
    assert.ok(errors.some((e) => e.includes("prompt_hash")));
  });

  it("non-object is an error", () => {
    assert.ok(validateProvenance(null).length > 0);
    assert.ok(validateProvenance("string").length > 0);
  });

  it("bad source_span is an error", () => {
    const bad = { ...reviewedProv, source_span: { start: 250, end: 100 } };
    const errors = validateProvenance(bad);
    assert.ok(errors.some((e) => e.includes("start")));
  });

  it("provenance without source_span is valid", () => {
    const noSpan = { ...reviewedProv };
    delete (noSpan as Record<string, unknown>).source_span;
    assert.deepEqual(validateProvenance(noSpan), []);
  });
});
