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

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameSection(a: Section, b: Section): boolean {
  if (a.crn && b.crn) return a.crn === b.crn;
  return a.label === b.label;
}
