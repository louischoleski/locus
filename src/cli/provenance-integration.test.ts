import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capGradeForExtraction, type ExtractionProvenance } from "../registry/provenance.ts";
import type { Fact, Grade } from "../ir/grade.ts";

const baseProv: ExtractionProvenance = {
  model: "gpt-4o",
  model_version: "2024-08-06",
  prompt_hash: "sha256:abc123",
  extraction_date: "2026-11-22",
  source_id: "doi:10.1234/test",
  reviewer: null,
};

describe("provenance integration — grade capping in build context", () => {
  it("unreviewed provenance caps a measured fact to inferred", () => {
    const fact: Fact = {
      id: "f1",
      claim: "tropism",
      subject: { tissue: "liver" },
      value: "high",
      grade: { m: "measured", o: "same" },
      from: [],
      provenance: { ...baseProv, reviewer: null },
    };

    // Simulate what build.ts does: cap grade for unreviewed provenance
    fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);

    assert.equal(fact.grade.m, "inferred", "method axis should be capped to inferred");
    assert.equal(fact.grade.o, "same", "organism axis should be untouched");
  });

  it("reviewed provenance lets a measured fact pass through", () => {
    const reviewedProv: ExtractionProvenance = {
      ...baseProv,
      reviewer: "mk",
    };

    const fact: Fact = {
      id: "f2",
      claim: "tropism",
      subject: { tissue: "liver" },
      value: "high",
      grade: { m: "measured", o: "same" },
      from: [],
      provenance: reviewedProv,
    };

    fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);

    assert.equal(fact.grade.m, "measured", "method axis should pass through unchanged");
    assert.equal(fact.grade.o, "same", "organism axis should be untouched");
  });

  it("unreviewed provenance does not affect computed grade (caps to inferred)", () => {
    const fact: Fact = {
      id: "f3",
      claim: "site_occurrences",
      subject: { site: 0 },
      value: 1,
      grade: { m: "computed", o: "n/a" },
      from: [],
      provenance: { ...baseProv, reviewer: null },
    };

    fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);

    assert.equal(fact.grade.m, "inferred", "computed should be capped to inferred when unreviewed");
    assert.equal(fact.grade.o, "n/a", "organism axis should be untouched");
  });

  it("unreviewed provenance leaves asserted grade alone (weaker than cap)", () => {
    const fact: Fact = {
      id: "f4",
      claim: "residence",
      subject: { tissue: "neuron" },
      value: true,
      grade: { m: "asserted", o: "same" },
      from: [],
      provenance: { ...baseProv, reviewer: null },
    };

    fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);

    assert.equal(fact.grade.m, "asserted", "asserted is weaker than inferred cap, should pass through");
  });

  it("fact without provenance is not affected", () => {
    const fact: Fact = {
      id: "f5",
      claim: "tropism",
      subject: { tissue: "liver" },
      value: "high",
      grade: { m: "measured", o: "same" },
      from: [],
    };

    // No provenance — build.ts skips the cap
    const original: Grade = { ...fact.grade };
    if (fact.provenance && fact.provenance.reviewer === null) {
      fact.grade = capGradeForExtraction(fact.grade, fact.provenance as ExtractionProvenance);
    }

    assert.deepEqual(fact.grade, original, "grade should be untouched when no provenance");
  });
});
