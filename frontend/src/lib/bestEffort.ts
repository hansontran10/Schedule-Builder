import { solve, type SolveOptions, type SolveResult } from "./solver";
import type { Block, Course, Preferences } from "./types";

export interface LeftOut {
  course: Course;
  /** Why it couldn't be placed, e.g. "overlaps MATH 0001". */
  reason: string;
}

export interface BestEffort {
  result: SolveResult;
  /** Classes that don't fit with the ones before them. Empty when everything fits. */
  leftOut: LeftOut[];
}

/**
 * Like solve, but one class that doesn't fit never blanks the whole schedule. If no schedule holds
 * every class, classes are kept in the order they were added and the ones that can't fit are set
 * aside with a reason, so the calendar still shows everything else.
 */
export function solveBestEffort(courses: Course[], blocks: Block[], prefs: Preferences, options: SolveOptions = {}): BestEffort {
  const full = solve(courses, blocks, prefs, options);
  if (full.schedules.length > 0 || courses.length === 0) return { result: full, leftOut: [] };

  const kept: Course[] = [];
  const leftOut: LeftOut[] = [];
  for (const course of courses) {
    const trial = solve([...kept, course], blocks, prefs, { keep: 1, maxSchedules: 1 });
    if (trial.schedules.length > 0) {
      kept.push(course);
      continue;
    }
    let reason = "doesn't fit with your other classes";
    for (const d of trial.diagnostics) {
      if (d.kind === "no_sections" && d.course === course.code) reason = "has no sections yet";
      else if (d.kind === "all_sections_rejected" && d.course === course.code) {
        reason = `breaks a rule: ${[...new Set(d.reasons.map((r) => r.reason))].join("; ")}`;
      } else if (d.kind === "always_conflict" && d.courses.includes(course.code)) {
        reason = `overlaps ${d.courses.find((c) => c !== course.code) ?? "another class"}`;
      }
    }
    leftOut.push({ course, reason });
  }
  return { result: solve(kept, blocks, prefs, options), leftOut };
}
