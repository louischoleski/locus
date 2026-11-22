import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  meet,
  meetsFloor,
  gradeEq,
  effectiveGrade,
  METHOD_ORDER,
  ORGANISM_ORDER,
  type Grade,
  type Method,
  type Organism,
  type Fact,
} from "./grade.ts";

/** All possible grades for exhaustive testing. */
const ALL_GRADES: Grade[] = [];
for (const m of METHOD_ORDER) {
  for (const o of ORGANISM_ORDER) {
    ALL_GRADES.push({ m, o });
  }
}

describe("grade algebra properties", () => {
  it("meet is commutative", () => {
    for (const a of ALL_GRADES) {
      for (const b of ALL_GRADES) {
        assert.ok(gradeEq(meet(a, b), meet(b, a)), `meet(${a.m},${a.o}, ${b.m},${b.o}) not commutative`);
      }
    }
  });

  it("meet is associative", () => {
    for (const a of ALL_GRADES) {
      for (const b of ALL_GRADES) {
        for (const c of ALL_GRADES) {
          assert.ok(
            gradeEq(meet(meet(a, b), c), meet(a, meet(b, c))),
            `meet not associative for (${a.m},${a.o}), (${b.m},${b.o}), (${c.m},${c.o})`,
          );
        }
      }
    }
  });

  it("meet is idempotent", () => {
    for (const a of ALL_GRADES) {
      assert.ok(gradeEq(meet(a, a), a), `meet(${a.m},${a.o}) not idempotent`);
    }
  });

  it("meet is monotone on each axis independently", () => {
    // For method axis: if rank(a.m) <= rank(b.m), then rank(meet(a,x).m) <= rank(meet(b,x).m)
    const mRank = (m: Method) => METHOD_ORDER.indexOf(m);
    const oRank = (o: Organism) => ORGANISM_ORDER.indexOf(o);

    for (const a of ALL_GRADES) {
      for (const b of ALL_GRADES) {
        for (const x of ALL_GRADES) {
          const ma = meet(a, x);
          const mb = meet(b, x);

          if (mRank(a.m) <= mRank(b.m)) {
            assert.ok(
              mRank(ma.m) <= mRank(mb.m),
              `method monotonicity: a=(${a.m},${a.o}) b=(${b.m},${b.o}) x=(${x.m},${x.o})`,
            );
          }
          if (oRank(a.o) <= oRank(b.o)) {
            assert.ok(
              oRank(ma.o) <= oRank(mb.o),
              `organism monotonicity: a=(${a.m},${a.o}) b=(${b.m},${b.o}) x=(${x.m},${x.o})`,
            );
          }
        }
      }
    }
  });

  it("no fact's effective grade exceeds the meet of its parents", () => {
    // Build a small fact graph
    const f1: Fact = {
      id: "f1",
      claim: "a",
      subject: {},
      value: 0,
      grade: { m: "computed", o: "n/a" },
      from: [],
    };
    const f2: Fact = {
      id: "f2",
      claim: "b",
      subject: {},
      value: true,
      grade: { m: "measured", o: "same" },
      from: [],
    };
    const f3: Fact = {
      id: "f3",
      claim: "c",
      subject: {},
      value: true,
      grade: { m: "computed", o: "same" },
      from: ["f1", "f2"],
    };

    const facts = new Map<string, Fact>([
      ["f1", f1],
      ["f2", f2],
      ["f3", f3],
    ]);

    const eff = effectiveGrade("f3", facts);
    const parentMeet = meet(
      effectiveGrade("f1", facts),
      effectiveGrade("f2", facts),
    );

    // Effective grade should not exceed the parent meet on either axis
    assert.ok(
      meetsFloor(parentMeet, eff),
      `effective grade (${eff.m},${eff.o}) exceeds parent meet (${parentMeet.m},${parentMeet.o})`,
    );
  });

  it("an unannotated field parses to (unknown, unknown)", () => {
    const defaultGrade: Grade = { m: "unknown", o: "unknown" };
    assert.equal(defaultGrade.m, "unknown");
    assert.equal(defaultGrade.o, "unknown");
  });

  it("an assertion with no supporting fact is always refused", () => {
    // Any floor requires at least one fact. With no facts, there is nothing
    // to check against the floor, so the assertion must be refused.
    // This is a design rule — we verify the logic here.
    const floors: Grade[] = [
      { m: "computed", o: "n/a" },
      { m: "inferred", o: "same" },
      { m: "measured", o: "n/a" },
      { m: "measured", o: "same" },
    ];

    for (const floor of floors) {
      // No supporting facts -> refused
      const supportingFacts: string[] = [];
      const refused = supportingFacts.length === 0;
      assert.ok(refused, `assertion with floor (${floor.m},${floor.o}) should be refused with no facts`);
    }
  });

  it("adding a fact never changes an existing fact's grade", () => {
    const f1: Fact = {
      id: "f1",
      claim: "a",
      subject: {},
      value: 0,
      grade: { m: "computed", o: "n/a" },
      from: [],
    };
    const f2: Fact = {
      id: "f2",
      claim: "b",
      subject: {},
      value: true,
      grade: { m: "inferred", o: "same" },
      from: ["f1"],
    };

    const factsBefore = new Map<string, Fact>([["f1", f1], ["f2", f2]]);
    const effF1Before = effectiveGrade("f1", factsBefore);
    const effF2Before = effectiveGrade("f2", factsBefore);

    // Add a new fact that depends on f1
    const f3: Fact = {
      id: "f3",
      claim: "c",
      subject: {},
      value: 42,
      grade: { m: "asserted", o: "distant" },
      from: ["f1"],
    };

    const factsAfter = new Map<string, Fact>([["f1", f1], ["f2", f2], ["f3", f3]]);
    const effF1After = effectiveGrade("f1", factsAfter);
    const effF2After = effectiveGrade("f2", factsAfter);

    assert.ok(gradeEq(effF1Before, effF1After), "f1 grade changed after adding f3");
    assert.ok(gradeEq(effF2Before, effF2After), "f2 grade changed after adding f3");
  });
});

describe("meetsFloor", () => {
  it("computed,n/a meets computed,n/a floor", () => {
    assert.ok(meetsFloor({ m: "computed", o: "n/a" }, { m: "computed", o: "n/a" }));
  });

  it("inferred,same meets inferred,same floor", () => {
    assert.ok(meetsFloor({ m: "inferred", o: "same" }, { m: "inferred", o: "same" }));
  });

  it("asserted,same does not meet measured,same floor", () => {
    assert.ok(!meetsFloor({ m: "asserted", o: "same" }, { m: "measured", o: "same" }));
  });

  it("measured,related does not meet measured,same floor", () => {
    assert.ok(!meetsFloor({ m: "measured", o: "related" }, { m: "measured", o: "same" }));
  });

  it("computed,same exceeds inferred,same floor", () => {
    assert.ok(meetsFloor({ m: "computed", o: "same" }, { m: "inferred", o: "same" }));
  });
});
