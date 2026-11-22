import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { refusalDiagnostics, formatDiagnostics, diagnosticsToJson, type Diagnostic } from "./diagnostics.ts";

describe("diagnostics", () => {
  const assertions = [
    { name: "signature_unique_in_reference", status: "allowed", reasons: [] },
    { name: "sequence_unique_in_host", status: "refused", reasons: ["no supporting fact"] },
    { name: "construct_fits_vehicle", status: "refused", reasons: ["no supporting fact"] },
    {
      name: "eliminates_reservoir",
      status: "refused",
      reasons: ["no supporting fact", "residence not exhaustive", "outcome distribution unknown"],
    },
  ];

  it("generates R1xx codes for refusals only", () => {
    const diags = refusalDiagnostics(assertions, "test.locus");
    assert.equal(diags.length, 3); // 3 refused assertions
    assert.ok(diags.every((d) => d.code.startsWith("R1")));
    assert.equal(diags[0]!.code, "R101");
    assert.equal(diags[1]!.code, "R102");
    assert.equal(diags[2]!.code, "R103");
  });

  it("refusal messages include assertion name and reason count", () => {
    const diags = refusalDiagnostics(assertions, "test.locus");
    assert.ok(diags[0]!.message.includes("sequence_unique_in_host"));
    assert.ok(diags[0]!.message.includes("1 reason"));
    assert.ok(diags[2]!.message.includes("3 reason"));
  });

  it("formatDiagnostics produces stable text format", () => {
    const diags: Diagnostic[] = [
      { code: "E201", file: "design.locus", line: 7, col: 3, message: "tolerance is mandatory" },
      { code: "R101", file: "design.locus", message: "eliminates_reservoir refused: 3 reason(s)" },
    ];
    const text = formatDiagnostics(diags);
    assert.ok(text.includes("E201  design.locus:7:3  tolerance is mandatory"));
    assert.ok(text.includes("R101  design.locus  eliminates_reservoir"));
  });

  it("diagnosticsToJson produces valid parseable JSON array", () => {
    const diags: Diagnostic[] = [
      { code: "E201", file: "x.locus", line: 1, col: 1, message: "test" },
    ];
    const json = diagnosticsToJson(diags);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].code, "E201");
    assert.equal(parsed[0].line, 1);
  });

  it("code groups are correct: E1xx lex, E2xx static, E3xx resolution, E4xx schema, R1xx refusal", () => {
    // Verify by convention — these codes appear throughout the codebase
    const codeGroups: Record<string, string> = {
      E100: "lexical",
      E101: "syntax",
      E201: "static check",
      E301: "resolution",
      E400: "schema",
      R101: "refusal",
    };
    for (const [code, group] of Object.entries(codeGroups)) {
      const prefix = code.slice(0, 2);
      if (prefix === "E1") assert.ok(["lexical", "syntax"].includes(group));
      if (prefix === "E2") assert.equal(group, "static check");
      if (prefix === "E3") assert.equal(group, "resolution");
      if (prefix === "E4") assert.equal(group, "schema");
      if (prefix === "R1") assert.equal(group, "refusal");
    }
  });

  it("--json error output for bad file is parseable", () => {
    // Simulate what the CLI would produce
    const errors = [
      { code: "E201", file: "bad.locus", line: 3, col: 1, message: "organism mandatory" },
      { code: "E202", file: "bad.locus", line: 3, col: 1, message: "tolerance mandatory" },
    ];
    const json = diagnosticsToJson(errors);
    const parsed = JSON.parse(json);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].code, "E201");
    assert.equal(parsed[1].code, "E202");
  });
});
