import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveOrganismAxis, clearRelationsCache } from "./organism.ts";

describe("organism axis resolution", () => {
  it("null fact organism → n/a (organism-independent)", () => {
    assert.equal(resolveOrganismAxis(null, "human"), "n/a");
  });

  it("same organism → same", () => {
    assert.equal(resolveOrganismAxis("human", "human"), "same");
  });

  it("same organism case-insensitive → same", () => {
    assert.equal(resolveOrganismAxis("Human", "human"), "same");
    assert.equal(resolveOrganismAxis("HUMAN", "human"), "same");
  });

  it("mouse → human is related (in table)", () => {
    assert.equal(resolveOrganismAxis("mouse", "human"), "related");
  });

  it("human → mouse is related (symmetric entry in table)", () => {
    assert.equal(resolveOrganismAxis("human", "mouse"), "related");
  });

  it("nhp → human is related", () => {
    assert.equal(resolveOrganismAxis("nhp", "human"), "related");
  });

  it("macaque → human is related", () => {
    assert.equal(resolveOrganismAxis("macaque", "human"), "related");
  });

  it("rat → human is related", () => {
    assert.equal(resolveOrganismAxis("rat", "human"), "related");
  });

  it("dog → human is related", () => {
    assert.equal(resolveOrganismAxis("dog", "human"), "related");
  });

  it("pig → human is related", () => {
    assert.equal(resolveOrganismAxis("pig", "human"), "related");
  });

  it("zebrafish → human is distant (explicitly in table)", () => {
    assert.equal(resolveOrganismAxis("zebrafish", "human"), "distant");
  });

  it("unknown organism not in table → distant", () => {
    assert.equal(resolveOrganismAxis("drosophila", "human"), "distant");
  });

  it("completely unknown pair → distant", () => {
    assert.equal(resolveOrganismAxis("amoeba", "tardigrade"), "distant");
  });

  it("cell line context → distant (not organism-independent)", () => {
    // A cell line is a different system entirely, per spec
    assert.equal(resolveOrganismAxis("HeLa", "human"), "distant");
  });

  it("relations are directional — verify both directions exist for each pair", () => {
    // S&P: verify every (from, to) in the table has a (to, from) counterpart
    // This catches a subtle bug where someone adds mouse→human but forgets human→mouse
    const pairs = [
      ["mouse", "human"],
      ["rat", "human"],
      ["nhp", "human"],
      ["macaque", "human"],
      ["pig", "human"],
      ["dog", "human"],
      ["rat", "mouse"],
    ];
    for (const [a, b] of pairs) {
      const ab = resolveOrganismAxis(a!, b!);
      const ba = resolveOrganismAxis(b!, a!);
      assert.ok(
        ab !== "distant" || ba !== "distant",
        `pair (${a}, ${b}) and reverse should both be in the relations table`,
      );
      // Both should be the same organism-distance (related ↔ related)
      assert.equal(ab, ba, `asymmetric relation: (${a},${b})=${ab} vs (${b},${a})=${ba}`);
    }
  });
});
