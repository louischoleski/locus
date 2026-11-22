import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildObserved,
  validateNormalisationEntry,
  validateObserved,
  type NormalisationEntry,
} from "./normalisation.ts";

const entry1: NormalisationEntry = {
  raw: "~90% reduction in ganglionic HSV load",
  normalised: 0.90,
  rule: "reduction-fraction-v1",
  by: "mk",
  date: "2026-11-22",
};

const entry2: NormalisationEntry = {
  raw: "~90% reduction in ganglionic HSV load",
  normalised: 0.85,
  rule: "reduction-fraction-v2",
  by: "jd",
  date: "2026-11-22",
};

const entry3Agrees: NormalisationEntry = {
  raw: "~90% reduction in ganglionic HSV load",
  normalised: 0.90,
  rule: "reduction-fraction-v1",
  by: "jd",
  date: "2026-11-23",
};

describe("normalisation records", () => {
  it("single entry is not contested", () => {
    const obs = buildObserved([entry1]);
    assert.equal(obs.contested, false);
    assert.equal(obs.entries.length, 1);
  });

  it("two entries with same normalised value are not contested", () => {
    const obs = buildObserved([entry1, entry3Agrees]);
    assert.equal(obs.contested, false);
    assert.equal(obs.entries.length, 2);
  });

  it("two entries with different normalised values ARE contested", () => {
    const obs = buildObserved([entry1, entry2]);
    assert.equal(obs.contested, true);
    assert.equal(obs.entries.length, 2);
  });

  it("empty entries are not contested", () => {
    const obs = buildObserved([]);
    assert.equal(obs.contested, false);
    assert.equal(obs.entries.length, 0);
  });

  it("both entries are kept when contested (never deleted)", () => {
    const obs = buildObserved([entry1, entry2]);
    assert.equal(obs.entries.length, 2);
    assert.equal(obs.entries[0]!.by, "mk");
    assert.equal(obs.entries[1]!.by, "jd");
  });

  it("three entries with one dissenting → contested", () => {
    const obs = buildObserved([entry1, entry3Agrees, entry2]);
    assert.equal(obs.contested, true);
  });
});

describe("normalisation validation", () => {
  it("valid entry passes", () => {
    assert.deepEqual(validateNormalisationEntry(entry1), []);
  });

  it("missing raw is an error", () => {
    const bad = { ...entry1, raw: "" };
    assert.ok(validateNormalisationEntry(bad).some((e) => e.includes("raw")));
  });

  it("non-numeric normalised is an error", () => {
    const bad = { ...entry1, normalised: "ninety" };
    assert.ok(validateNormalisationEntry(bad).some((e) => e.includes("normalised")));
  });

  it("missing rule is an error", () => {
    const bad = { ...entry1, rule: "" };
    assert.ok(validateNormalisationEntry(bad).some((e) => e.includes("rule")));
  });

  it("missing by is an error", () => {
    const bad = { ...entry1, by: "" };
    assert.ok(validateNormalisationEntry(bad).some((e) => e.includes("by")));
  });

  it("bad date format is an error", () => {
    const bad = { ...entry1, date: "Nov 22 2026" };
    assert.ok(validateNormalisationEntry(bad).some((e) => e.includes("date")));
  });

  it("validateObserved checks all entries", () => {
    const errors = validateObserved({ entries: [entry1, { raw: "", normalised: "bad" }] });
    assert.ok(errors.length >= 2); // raw and normalised errors on second entry
  });

  it("validateObserved rejects non-array entries", () => {
    const errors = validateObserved({ entries: "not an array" });
    assert.ok(errors.some((e) => e.includes("array")));
  });
});
