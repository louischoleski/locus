import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateHeader } from "./validate.ts";

describe("registry validator", () => {
  const validHeader = {
    id: "vendor_x/AAV9",
    kind: "vehicle",
    capacity: { nominal_kb: 4.7, soft_limit_kb: 5.2, grade: { m: "measured", o: null } },
    accepts: ["transgene", "nuclease"],
    requires: [],
    tropism: [
      { term: "UBERON:0002107", level: "high", grade: { m: "measured", o: "human" }, source: "doi:10.1038/nbt.3341" },
    ],
    redosable: { value: false, grade: { m: "measured", o: null } },
    provenance: { extracted_by: null, reviewed_by: "mk", date: "2026-11-22" },
  };

  it("accepts a fully graded header", () => {
    const diags = validateHeader(validHeader);
    assert.equal(diags.length, 0, `unexpected diagnostics: ${JSON.stringify(diags)}`);
  });

  it("rejects a header whose capacity has no grade", () => {
    const bad = structuredClone(validHeader);
    delete (bad.capacity as Record<string, unknown>).grade;
    const diags = validateHeader(bad);
    assert.ok(diags.length > 0, "expected at least one diagnostic");
    assert.ok(
      diags.some((d) => d.code === "E401"),
      `expected E401 (missing grade), got: ${JSON.stringify(diags)}`,
    );
  });

  it("rejects a header whose tropism entry has no grade", () => {
    const bad = structuredClone(validHeader);
    delete (bad.tropism[0] as Record<string, unknown>).grade;
    const diags = validateHeader(bad);
    assert.ok(diags.length > 0, "expected at least one diagnostic");
    assert.ok(
      diags.some((d) => d.code === "E401"),
      `expected E401 (missing grade), got: ${JSON.stringify(diags)}`,
    );
  });

  it("rejects a header whose redosable has no grade", () => {
    const bad = structuredClone(validHeader);
    delete (bad.redosable as Record<string, unknown>).grade;
    const diags = validateHeader(bad);
    assert.ok(diags.length > 0);
    assert.ok(diags.some((d) => d.code === "E401"));
  });

  it("rejects a header with invalid method axis", () => {
    const bad = structuredClone(validHeader);
    (bad.capacity.grade as Record<string, unknown>).m = "proven";
    const diags = validateHeader(bad);
    assert.ok(diags.some((d) => d.code === "E404"));
  });

  it("rejects a header with missing grade axes", () => {
    const bad = structuredClone(validHeader);
    bad.capacity.grade = {} as typeof bad.capacity.grade;
    const diags = validateHeader(bad);
    assert.ok(diags.some((d) => d.code === "E403" || d.code === "E405"));
  });

  it("rejects a malformed id", () => {
    const bad = structuredClone(validHeader);
    bad.id = "AAV9";
    const diags = validateHeader(bad);
    assert.ok(diags.some((d) => d.code === "E407"));
  });

  it("rejects a header missing required fields", () => {
    const diags = validateHeader({ id: "x/y" });
    assert.ok(diags.some((d) => d.code === "E406"));
  });

  it("rejects a non-object", () => {
    const diags = validateHeader("not an object");
    assert.ok(diags.some((d) => d.code === "E400"));
  });
});
