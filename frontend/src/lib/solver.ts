import { rejectionReason, sectionsConflict } from "./conflicts";
import { scheduleStats, scoreStats } from "./score";
import type { Block, Course, Pick, Preferences, Schedule, Section } from "./types";

export interface SolveOptions {
  /** How many of the best schedules to return. */
  keep?: number;
  /** Stop after finding this many valid schedules, so a huge search can't freeze the page. */
  maxSchedules?: number;
}

export type Diagnostic =
  | { kind: "no_sections"; course: string }
  | { kind: "all_sections_rejected"; course: string; reasons: Array<{ section: string; reason: string }> }
  | { kind: "always_conflict"; courses: [string, string] }
  | { kind: "no_combination" };

export interface SolveResult {
  schedules: Schedule[];
  /** Valid schedules found (up to maxSchedules). Time-identical sections count once. */
  totalFound: number;
  truncated: boolean;
  diagnostics: Diagnostic[];
}

/** Sections of one course that meet at exactly the same times. Interchangeable for the search. */
interface Option {
  course: Course;
  sections: Section[];
}

function meetingKey(section: Section): string {
  return section.meetings
    .map((m) => `${[...m.days].sort().join("")}@${m.start}-${m.end}@${m.startDate ?? ""}~${m.endDate ?? ""}`)
    .sort()
    .join("|");
}

function groupByTime(course: Course, sections: Section[]): Option[] {
  const groups = new Map<string, Section[]>();
  for (const s of sections) {
    const key = meetingKey(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].map((secs) => ({ course, sections: secs }));
}

/** Insert into an array kept sorted by score, keeping at most `limit` items. */
function insertTop(top: Schedule[], item: Schedule, limit: number): void {
  if (top.length === limit && item.score >= top[top.length - 1]!.score) return;
  let lo = 0;
  let hi = top.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (top[mid]!.score <= item.score) lo = mid + 1;
    else hi = mid;
  }
  top.splice(lo, 0, item);
  if (top.length > limit) top.pop();
}

export function solve(
  courses: Course[],
  blocks: Block[],
  prefs: Preferences,
  { keep = 50, maxSchedules = 100_000 }: SolveOptions = {},
): SolveResult {
  const diagnostics: Diagnostic[] = [];

  // 1. Apply hard constraints to each course's sections.
  const optionsPerCourse: Option[][] = [];
  for (const course of courses) {
    if (course.sections.length === 0) {
      diagnostics.push({ kind: "no_sections", course: course.code });
      continue;
    }
    const kept: Section[] = [];
    const reasons: Array<{ section: string; reason: string }> = [];
    for (const s of course.sections) {
      const reason = rejectionReason(s, blocks, prefs);
      if (reason) reasons.push({ section: s.label, reason });
      else kept.push(s);
    }
    if (kept.length === 0) {
      diagnostics.push({ kind: "all_sections_rejected", course: course.code, reasons });
      continue;
    }
    optionsPerCourse.push(groupByTime(course, kept));
  }
  if (diagnostics.length > 0 || courses.length === 0) {
    return { schedules: [], totalFound: 0, truncated: false, diagnostics };
  }

  // 2. Most-constrained course first: fewer options near the top of the tree means earlier pruning.
  optionsPerCourse.sort((a, b) => a.length - b.length);

  // 3. Depth-first search, pruning as soon as a pick conflicts with an earlier one.
  const top: Schedule[] = [];
  const chosen: Option[] = [];
  let totalFound = 0;
  let truncated = false;

  const visit = (depth: number): void => {
    if (truncated) return;
    if (depth === optionsPerCourse.length) {
      totalFound++;
      if (totalFound >= maxSchedules) truncated = true;
      const picks: Pick[] = chosen.map((o) => ({ course: o.course, section: o.sections[0]!, alternatives: o.sections.slice(1) }));
      const stats = scheduleStats(picks);
      insertTop(top, { picks, stats, score: scoreStats(stats, prefs) }, keep);
      return;
    }
    for (const option of optionsPerCourse[depth]!) {
      const rep = option.sections[0]!;
      if (chosen.some((c) => sectionsConflict(c.sections[0]!, rep))) continue;
      chosen.push(option);
      visit(depth + 1);
      chosen.pop();
      if (truncated) return;
    }
  };
  visit(0);

  // 4. Explain an empty result: look for two courses that can never fit together.
  if (totalFound === 0) {
    for (let i = 0; i < optionsPerCourse.length; i++) {
      for (let j = i + 1; j < optionsPerCourse.length; j++) {
        const a = optionsPerCourse[i]!;
        const b = optionsPerCourse[j]!;
        const neverFits = a.every((oa) => b.every((ob) => sectionsConflict(oa.sections[0]!, ob.sections[0]!)));
        if (neverFits) diagnostics.push({ kind: "always_conflict", courses: [a[0]!.course.code, b[0]!.course.code] });
      }
    }
    if (diagnostics.length === 0) diagnostics.push({ kind: "no_combination" });
  }

  return { schedules: top, totalFound, truncated, diagnostics };
}
