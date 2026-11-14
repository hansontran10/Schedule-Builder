import type { Course, Section } from "./types";

/**
 * Add classes picked on the school's page. A class already in the planner (same code)
 * gets any new sections merged in, matched by CRN when there is one, otherwise by label.
 */
export function mergeCourses(existing: Course[], incoming: Course[]): Course[] {
  const result = existing.map((c) => ({ ...c, sections: [...c.sections] }));
  for (const course of incoming) {
    const key = normalizeCode(course.code);
    const match = result.find((c) => normalizeCode(c.code) === key);
    if (!match) {
      result.push({ ...course, sections: [...course.sections] });
      continue;
    }
    if (!match.title && course.title) match.title = course.title;
    for (const section of course.sections) {
      const i = match.sections.findIndex((s) => sameSection(s, section));
      if (i === -1) match.sections.push(section);
      else match.sections[i] = { ...section, id: match.sections[i]!.id }; // refresh times/instructor
    }
  }
  return result;
}

/** Take sections with these CRNs out of the planner; a class left with no sections goes too. */
export function removeSections(courses: Course[], crns: Iterable<string>): { courses: Course[]; removed: string[] } {
  const gone = new Set(crns);
  const removed: string[] = [];
  const result: Course[] = [];
  for (const c of courses) {
    const sections = c.sections.filter((s) => {
      const drop = !!s.crn && gone.has(s.crn);
      if (drop) removed.push(`${c.code} ${s.label}`);
      return !drop;
    });
    if (sections.length === c.sections.length) result.push(c);
    else if (sections.length > 0) result.push({ ...c, sections });
  }
  return { courses: result, removed };
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameSection(a: Section, b: Section): boolean {
  if (a.crn && b.crn) return a.crn === b.crn;
  return a.label === b.label;
}
