import { describe, expect, it } from "vitest";
import { rejectionReason, sectionsConflict } from "./conflicts";
import { scheduleStats, scoreStats } from "./score";
import { solve } from "./solver";
import { course, prefs, sec } from "./testing";
import type { Block, Course, Day, Preferences, Section } from "./types";

describe("conflicts", () => {
  it("back-to-back classes do not conflict", () => {
    expect(sectionsConflict(sec("a", "MWF 9:00-9:50"), sec("b", "MWF 9:50-10:40"))).toBe(false);
  });
  it("overlap on a shared day conflicts", () => {
    expect(sectionsConflict(sec("a", "MWF 9:00-9:50"), sec("b", "W 9:30-11:00"))).toBe(true);
  });
  it("same times on different days do not conflict", () => {
    expect(sectionsConflict(sec("a", "MWF 9:00-9:50"), sec("b", "TR 9:00-9:50"))).toBe(false);
  });
  it("online never conflicts", () => {
    expect(sectionsConflict(sec("a", "online"), sec("b", "MTWRF 8:00-17:00"))).toBe(false);
  });
});

describe("solve", () => {
  it("finds every conflict-free combination", () => {
    const a = course("A", sec("1", "MWF 9:00-9:50"), sec("2", "MWF 10:00-10:50"));
    const b = course("B", sec("1", "MWF 9:00-9:50"), sec("2", "TR 9:00-10:15"));
    const r = solve([a, b], [], prefs());
    // A1+B2, A2+B1, A2+B2 work; A1+B1 conflicts.
    expect(r.totalFound).toBe(3);
    expect(r.diagnostics).toEqual([]);
    for (const s of r.schedules) expect(s.picks).toHaveLength(2);
  });

  it("returns schedules best-first", () => {
    const a = course("A", sec("early", "MWF 8:00-8:50"), sec("late", "MWF 11:00-11:50"));
    const r = solve([a], [], prefs({ weights: { gaps: 0, daysOnCampus: 0, earlyMornings: 3, lateEvenings: 0 } }));
    expect(r.schedules.map((s) => s.picks[0]!.section.label)).toEqual(["late", "early"]);
    expect(r.schedules[0]!.score).toBeLessThan(r.schedules[1]!.score);
  });

  it("groups sections with identical times and lists the others as alternatives", () => {
    const a = course("A", sec("001", "MWF 9:00-9:50"), sec("002", "MWF 9:00-9:50"), sec("003", "TR 9:00-10:15"));
    const r = solve([a], [], prefs());
    expect(r.totalFound).toBe(2);
    const mwf = r.schedules.find((s) => s.picks[0]!.section.label === "001")!;
    expect(mwf.picks[0]!.alternatives.map((s) => s.label)).toEqual(["002"]);
  });

  it("applies days off, time limits and busy blocks", () => {
    const a = course("A", sec("fri", "MWF 11:00-11:50"), sec("early", "TR 8:00-9:15"), sec("work", "TR 1:00pm-2:15pm"),
      sec("late", "TR 6:00pm-7:15pm"), sec("ok", "TR 11:00-12:15pm"));
    const work: Block = { id: "b", label: "Work", days: ["T"], start: 780, end: 960 };
    const p = prefs({ daysOff: ["F"], noClassBefore: 9 * 60, noClassAfter: 17 * 60 });
    const r = solve([a], [work], p);
    expect(r.schedules.map((s) => s.picks[0]!.section.label)).toEqual(["ok"]);
    expect(rejectionReason(a.sections[0]!, [work], p)).toContain("F");
    expect(rejectionReason(a.sections[1]!, [work], p)).toBe("starts too early");
    expect(rejectionReason(a.sections[2]!, [work], p)).toBe('overlaps "Work"');
    expect(rejectionReason(a.sections[3]!, [work], p)).toBe("ends too late");
  });

  it("explains a course with no usable sections", () => {
    const a = course("A", sec("1", "F 9:00-9:50"));
    const r = solve([a, course("B")], [], prefs({ daysOff: ["F"] }));
    expect(r.schedules).toEqual([]);
    expect(r.diagnostics).toContainEqual({ kind: "no_sections", course: "B" });
    expect(r.diagnostics).toContainEqual({
      kind: "all_sections_rejected", course: "A", reasons: [{ section: "1", reason: "meets on F, which you want off" }],
    });
  });

  it("names two courses that can never fit together", () => {
    const a = course("A", sec("1", "MWF 9:00-9:50"));
    const b = course("B", sec("1", "MW 9:30-10:45"), sec("2", "F 9:00-9:50"));
    const r = solve([a, b], [], prefs());
    expect(r.totalFound).toBe(0);
    expect(r.diagnostics).toEqual([{ kind: "always_conflict", courses: ["A", "B"] }]);
  });

  it("reports when every pair fits but all courses together do not", () => {
    // Three courses, each offered only in the same two time slots.
    const make = (code: string) => course(code, sec("x", "MWF 9:00-9:50"), sec("y", "MWF 10:00-10:50"));
    const r = solve([make("A"), make("B"), make("C")], [], prefs());
    expect(r.totalFound).toBe(0);
    expect(r.diagnostics).toEqual([{ kind: "no_combination" }]);
  });

  it("stops at maxSchedules and says so", () => {
    const many = (code: string) => course(code, ...Array.from({ length: 10 }, (_, i) => sec(String(i), `${"MTWRF"[i % 5]} ${8 + i}:00-${8 + i}:30`)));
    const r = solve([many("A"), many("B"), many("C")], [], prefs(), { maxSchedules: 50 });
    expect(r.truncated).toBe(true);
    expect(r.totalFound).toBe(50);
  });

  it("keeps only the best `keep` schedules", () => {
    const many = course("A", ...Array.from({ length: 20 }, (_, i) => sec(String(i), `M ${7 + (i % 12)}:00-${7 + (i % 12)}:45`)));
    const r = solve([many], [], prefs(), { keep: 5 });
    expect(r.schedules).toHaveLength(5);
    expect(r.totalFound).toBe(12); // 20 sections, 12 distinct times
  });

  it("handles a realistic semester quickly", () => {
    const patterns = ["MWF", "TR", "MW", "TR", "MWF", "TR", "MW", "F"];
    const courses = Array.from({ length: 6 }, (_, c) =>
      course(`C${c}`, ...patterns.map((days, i) => sec(String(i), `${days} ${8 + ((i + c) % 10)}:00-${8 + ((i + c) % 10)}:50`))),
    );
    const started = performance.now();
    const r = solve(courses, [], prefs());
    expect(performance.now() - started).toBeLessThan(2000);
    expect(r.totalFound).toBeGreaterThan(0);
  });
});

// ---- Randomized check against a brute-force version ----

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

function randomCourses(rand: () => number): Course[] {
  const dayPatterns: Day[][] = [["M", "W", "F"], ["T", "R"], ["M", "W"], ["F"], ["T"]];
  const n = 1 + Math.floor(rand() * 4);
  return Array.from({ length: n }, (_, c) => {
    const count = 1 + Math.floor(rand() * 4);
    const sections: Section[] = Array.from({ length: count }, (_, i) => {
      if (rand() < 0.1) return { id: `${c}-${i}`, label: String(i), meetings: [] };
      const start = 480 + Math.floor(rand() * 20) * 30;
      return {
        id: `${c}-${i}`, label: String(i),
        meetings: [{ days: dayPatterns[Math.floor(rand() * dayPatterns.length)]!, start, end: start + 50 + Math.floor(rand() * 3) * 25 }],
      };
    });
    return { id: `c${c}`, code: `C${c}`, sections };
  });
}

function bruteForce(courses: Course[], blocks: Block[], p: Preferences) {
  const usable = courses.map((c) => c.sections.filter((s) => rejectionReason(s, blocks, p) === null));
  const timeKey = (s: Section) => JSON.stringify(s.meetings.map((m) => [[...m.days].sort(), m.start, m.end]).sort());
  const seen = new Set<string>();
  let best = Infinity;
  const walk = (i: number, chosen: Section[]) => {
    if (i === courses.length) {
      const key = chosen.map(timeKey).join("#");
      if (seen.has(key)) return;
      seen.add(key);
      const picks = chosen.map((s, j) => ({ course: courses[j]!, section: s, alternatives: [] }));
      best = Math.min(best, scoreStats(scheduleStats(picks), p));
      return;
    }
    for (const s of usable[i]!) {
      if (chosen.every((c) => !sectionsConflict(c, s))) walk(i + 1, [...chosen, s]);
    }
  };
  walk(0, []);
  return { count: seen.size, best };
}

it("matches brute force on 500 random inputs", () => {
  const rand = rng(42);
  for (let t = 0; t < 500; t++) {
    const courses = randomCourses(rand);
    const p = prefs({
      daysOff: rand() < 0.3 ? ["F"] : [],
      noClassBefore: rand() < 0.3 ? 540 : null,
      weights: { gaps: Math.floor(rand() * 4), daysOnCampus: Math.floor(rand() * 4), earlyMornings: Math.floor(rand() * 4), lateEvenings: Math.floor(rand() * 4) },
    });
    const blocks: Block[] = rand() < 0.3 ? [{ id: "b", label: "Work", days: ["T"], start: 720, end: 900 }] : [];
    const expected = bruteForce(courses, blocks, p);
    const r = solve(courses, blocks, p, { keep: 1000 });
    expect(r.totalFound, `case ${t}`).toBe(expected.count);
    if (expected.count > 0) expect(r.schedules[0]!.score, `case ${t}`).toBeCloseTo(expected.best);
  }
});

describe("half-semester classes", () => {
  const firstHalf = (label: string) => ({ ...sec(label, "TR 2:00pm-3:15pm"), meetings: [{ days: ["T", "R"] as Day[], start: 840, end: 915, startDate: "2027-01-11", endDate: "2027-03-03" }] });
  const secondHalf = (label: string) => ({ ...sec(label, "TR 2:00pm-3:15pm"), meetings: [{ days: ["T", "R"] as Day[], start: 840, end: 915, startDate: "2027-03-04", endDate: "2027-05-04" }] });
  const fullTerm = (label: string) => ({ ...sec(label, "TR 2:00pm-3:15pm"), meetings: [{ days: ["T", "R"] as Day[], start: 840, end: 915, startDate: "2027-01-11", endDate: "2027-04-28" }] });

  it("same time in different halves does not conflict", () => {
    expect(sectionsConflict(firstHalf("a"), secondHalf("b"))).toBe(false);
    expect(solve([course("A", firstHalf("1")), course("B", secondHalf("1"))], [], prefs()).totalFound).toBe(1);
  });

  it("overlapping date ranges still conflict, including a full-term class", () => {
    expect(sectionsConflict(fullTerm("a"), secondHalf("b"))).toBe(true);
    expect(sectionsConflict(firstHalf("a"), sec("b", "T 2:30pm-3:00pm"))).toBe(true); // no dates = whole term
  });

  it("does not treat different halves as the same time slot", () => {
    const r = solve([course("A", firstHalf("1"), secondHalf("2"))], [], prefs());
    expect(r.totalFound).toBe(2);
    expect(r.schedules.every((s) => s.picks[0]!.alternatives.length === 0)).toBe(true);
  });
});
