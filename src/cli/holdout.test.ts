import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyHoldout, partitionFixtures, type FixtureHoldoutMeta, type HoldoutSet } from "./holdout.ts";

const fixtures: FixtureHoldoutMeta[] = [
  { fixture: "study_a.locus", holdout: { date: "2023-01-15", lab: "smith_lab", vector_family: "AAV" } },
  { fixture: "study_b.locus", holdout: { date: "2024-07-01", lab: "jones_lab", vector_family: "AAV" } },
  { fixture: "study_c.locus", holdout: { date: "2024-03-10", lab: "smith_lab", vector_family: "LNP" } },
  { fixture: "study_d.locus", holdout: { date: "2025-01-20", lab: "chen_lab", vector_family: "LNP" } },
  { fixture: "study_e.locus", holdout: { date: "2022-06-01", lab: "park_lab", vector_family: "lentivirus" } },
];

describe("three-key holdout split", () => {
  it("holds out by date alone", () => {
    const holdoutSet: HoldoutSet = { after_date: "2024-01-01" };
    const results = applyHoldout(fixtures, holdoutSet);

    const heldOut = results.filter((r) => r.heldOut);
    assert.equal(heldOut.length, 3); // study_b, study_c, study_d
    assert.ok(heldOut.every((r) => r.reasons.some((re) => re.includes("date"))));

    // study_a and study_e are before the cutoff
    assert.ok(!results.find((r) => r.fixture === "study_a.locus")!.heldOut);
    assert.ok(!results.find((r) => r.fixture === "study_e.locus")!.heldOut);
  });

  it("holds out by lab alone", () => {
    const holdoutSet: HoldoutSet = { labs: ["smith_lab"] };
    const results = applyHoldout(fixtures, holdoutSet);

    const heldOut = results.filter((r) => r.heldOut);
    assert.equal(heldOut.length, 2); // study_a, study_c
    assert.ok(heldOut.every((r) => r.reasons.some((re) => re.includes("lab"))));
  });

  it("holds out by vector family alone", () => {
    const holdoutSet: HoldoutSet = { vector_families: ["LNP"] };
    const results = applyHoldout(fixtures, holdoutSet);

    const heldOut = results.filter((r) => r.heldOut);
    assert.equal(heldOut.length, 2); // study_c, study_d
  });

  it("OR semantics: match on ANY key triggers holdout", () => {
    // Date cutoff catches study_b, study_c, study_d
    // Lab catches study_a, study_c (smith_lab)
    // Union: study_a, study_b, study_c, study_d — only study_e survives
    const holdoutSet: HoldoutSet = {
      after_date: "2024-01-01",
      labs: ["smith_lab"],
    };
    const results = applyHoldout(fixtures, holdoutSet);

    const heldOut = results.filter((r) => r.heldOut);
    assert.equal(heldOut.length, 4);

    const remaining = results.filter((r) => !r.heldOut);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.fixture, "study_e.locus");
  });

  it("all three keys combined — maximally conservative", () => {
    const holdoutSet: HoldoutSet = {
      after_date: "2024-01-01",
      labs: ["smith_lab"],
      vector_families: ["lentivirus"],
    };
    const results = applyHoldout(fixtures, holdoutSet);

    // Date: study_b, study_c, study_d
    // Lab: study_a, study_c
    // Vector: study_e
    // Union: all five
    const heldOut = results.filter((r) => r.heldOut);
    assert.equal(heldOut.length, 5, "all fixtures should be held out");
  });

  it("empty holdout set holds out nothing", () => {
    const results = applyHoldout(fixtures, {});
    assert.ok(results.every((r) => !r.heldOut));
  });

  it("partitionFixtures returns correct split", () => {
    const { training, holdout } = partitionFixtures(fixtures, { labs: ["chen_lab"] });
    assert.equal(holdout.length, 1);
    assert.equal(holdout[0], "study_d.locus");
    assert.equal(training.length, 4);
  });

  it("reasons accumulate when multiple keys match", () => {
    // study_c: date > 2024-01-01 AND lab = smith_lab AND vector = LNP
    const holdoutSet: HoldoutSet = {
      after_date: "2024-01-01",
      labs: ["smith_lab"],
      vector_families: ["LNP"],
    };
    const results = applyHoldout(fixtures, holdoutSet);
    const studyC = results.find((r) => r.fixture === "study_c.locus")!;
    assert.ok(studyC.heldOut);
    assert.equal(studyC.reasons.length, 3, `expected 3 reasons, got: ${studyC.reasons}`);
  });

  it("fixtures with missing keys are not held out by that key", () => {
    const partial: FixtureHoldoutMeta[] = [
      { fixture: "no_date.locus", holdout: { lab: "x", vector_family: "AAV" } },
      { fixture: "no_lab.locus", holdout: { date: "2025-01-01" } },
    ];
    const holdoutSet: HoldoutSet = { after_date: "2024-01-01", labs: ["y"] };
    const results = applyHoldout(partial, holdoutSet);

    // no_date.locus: no date to compare, lab x ≠ y → not held out
    assert.ok(!results[0]!.heldOut);
    // no_lab.locus: date 2025 > 2024 → held out
    assert.ok(results[1]!.heldOut);
  });
});
