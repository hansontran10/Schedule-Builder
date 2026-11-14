import { expect, it } from "vitest";
import { mergeCourses } from "./state";
import { normalizeState } from "./storage";
import { course, sec } from "./testing";
import { DEFAULT_PREFERENCES } from "./types";

it("adds a new class", () => {
  const merged = mergeCourses([course("CSC 231", sec("001", "MWF 9:00-9:50"))], [course("MAT 261", sec("001", "TR 9:30-10:45"))]);
  expect(merged.map((c) => c.code)).toEqual(["CSC 231", "MAT 261"]);
});

it("merges sections into a class already in the planner, ignoring spacing and case in the code", () => {
  const mine = course("CSC 231", { ...sec("001", "MWF 9:00-9:50"), crn: "20100" });
  const fromPage = course("csc231", { ...sec("001", "MWF 9:00-9:50"), crn: "20100" }, { ...sec("002", "MWF 11:00-11:50"), crn: "20101" });
  const merged = mergeCourses([mine], [fromPage]);
  expect(merged).toHaveLength(1);
  expect(merged[0]!.sections.map((s) => s.crn)).toEqual(["20100", "20101"]);
});

it("refreshes a section that changed time, keeping its id", () => {
  const mine = course("CSC 231", { ...sec("001", "MWF 9:00-9:50"), crn: "20100" });
  const moved = course("CSC 231", { ...sec("001", "MWF 10:00-10:50"), crn: "20100" });
  const merged = mergeCourses([mine], [moved]);
  expect(merged[0]!.sections).toHaveLength(1);
  expect(merged[0]!.sections[0]!.meetings[0]!.start).toBe(600);
  expect(merged[0]!.sections[0]!.id).toBe(mine.sections[0]!.id);
});

it("does not change the arrays it was given", () => {
  const mine = [course("CSC 231", sec("001", "MWF 9:00-9:50"))];
  mergeCourses(mine, [course("CSC 231", sec("002", "TR 9:30-10:45"))]);
  expect(mine[0]!.sections).toHaveLength(1);
});

it("normalizeState fills in missing or broken saved data", () => {
  expect(normalizeState(undefined).courses).toEqual([]);
  expect(normalizeState("garbage").prefs).toEqual(DEFAULT_PREFERENCES);
  const partial = normalizeState({ courses: "oops", prefs: { daysOff: ["F"], weights: { gaps: 3 } } });
  expect(partial.courses).toEqual([]);
  expect(partial.prefs.daysOff).toEqual(["F"]);
  expect(partial.prefs.weights).toEqual({ ...DEFAULT_PREFERENCES.weights, gaps: 3 });
});
