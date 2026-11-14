import { describe, expect, it } from "vitest";
import { solveBestEffort } from "./bestEffort";
import { removeSections } from "./state";
import { course, prefs, sec } from "./testing";

describe("solveBestEffort", () => {
  const art = course("ART 2210", sec("001", "MW 11:00-13:50"));
  const arth = course("ARTH 4948", sec("001", "MW 14:00-15:15"));
  const clash = course("MATH 0001", sec("001", "MWF 11:00-11:50"));

  it("is the same as solve when everything fits", () => {
    const r = solveBestEffort([art, arth], [], prefs());
    expect(r.leftOut).toEqual([]);
    expect(r.result.schedules[0]!.picks).toHaveLength(2);
  });

  it("keeps the schedule and sets aside the class that conflicts, with the reason", () => {
    const r = solveBestEffort([art, arth, clash], [], prefs());
    expect(r.result.schedules[0]!.picks.map((p) => p.course.code).sort()).toEqual(["ART 2210", "ARTH 4948"]);
    expect(r.leftOut.map((l) => [l.course.code, l.reason])).toEqual([["MATH 0001", "overlaps ART 2210"]]);
  });

  it("uses another section when one exists instead of setting the class aside", () => {
    const flexible = course("MATH 0001", sec("001", "MWF 11:00-11:50"), sec("002", "TR 9:00-9:50"));
    const r = solveBestEffort([art, flexible], [], prefs());
    expect(r.leftOut).toEqual([]);
    expect(r.result.schedules[0]!.picks.find((p) => p.course.code === "MATH 0001")!.section.label).toBe("002");
  });

  it("sets aside a class with no sections, or one that breaks a rule, without blanking the rest", () => {
    const empty = course("ENGL 1000");
    const early = course("BIOL 1050", sec("001", "TR 7:00-7:50"));
    const r = solveBestEffort([art, empty, early], [], prefs({ noClassBefore: 8 * 60 }));
    expect(r.result.schedules[0]!.picks.map((p) => p.course.code)).toEqual(["ART 2210"]);
    expect(r.leftOut.map((l) => l.course.code)).toEqual(["ENGL 1000", "BIOL 1050"]);
    expect(r.leftOut[0]!.reason).toBe("has no sections yet");
    expect(r.leftOut[1]!.reason).toMatch(/^breaks a rule/);
  });

  it("handles nothing fitting at all, and no classes", () => {
    const r = solveBestEffort([course("ENGL 1000")], [], prefs());
    expect(r.result.schedules).toEqual([]);
    expect(r.leftOut).toHaveLength(1);
    expect(solveBestEffort([], [], prefs()).leftOut).toEqual([]);
  });
});

describe("removeSections", () => {
  it("removes sections by CRN and drops a class left empty", () => {
    const a = { ...course("ART 1", { ...sec("001", "M 9:00-9:50"), crn: "111" }, { ...sec("002", "T 9:00-9:50"), crn: "222" }) };
    const b = { ...course("MATH 1", { ...sec("001", "W 9:00-9:50"), crn: "333" }) };
    const manual = course("HIST 1", sec("001", "F 9:00-9:50")); // no CRN: never touched
    const r = removeSections([a, b, manual], ["222", "333", "999"]);
    expect(r.removed).toEqual(["ART 1 002", "MATH 1 001"]);
    expect(r.courses.map((c) => [c.code, c.sections.map((s) => s.label)])).toEqual([["ART 1", ["001"]], ["HIST 1", ["001"]]]);
  });
});
