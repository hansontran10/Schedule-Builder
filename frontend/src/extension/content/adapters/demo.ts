import { parseMeetings } from "../../../lib/time";
import type { Course, Meeting, Section } from "../../../lib/types";
import type { SchoolAdapter } from "./types";

/**
 * Reads the made-up test pages in frontend/demo/. They imitate the general shape of an older
 * registration system but are NOT a real school's markup. Real schools get their own adapter,
 * written against saved copies of their actual pages.
 */
export const demoAdapter: SchoolAdapter = {
  id: "demo",
  name: "Demo University (test pages)",

  matches(url) {
    return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.pathname.startsWith("/demo/");
  },

  readResults(doc) {
    const table = doc.querySelector<HTMLTableElement>("table#searchResults");
    if (!table) return null;
    const byCode = new Map<string, Course>();
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      const cell = (name: string) => row.querySelector(`td.${name}`)?.textContent?.trim() ?? "";
      const code = `${cell("subject")} ${cell("course-number")}`.trim();
      if (!code) continue;
      const meetings = parseMeetingCell(cell("meeting"));
      if (meetings === null) continue; // unreadable time: skip rather than guess
      const section: Section = {
        id: `demo-${cell("crn") || cell("section")}`,
        label: cell("section"),
        crn: cell("crn") || undefined,
        instructor: cell("instructor") || undefined,
        meetings,
      };
      const course = byCode.get(code) ?? { id: `demo-${code}`, code, title: cell("title") || undefined, sections: [] };
      course.sections.push(section);
      byCode.set(code, course);
    }
    return { courses: [...byCode.values()], container: table };
  },

  crnForm(doc) {
    const form = doc.querySelector<HTMLElement>("#enterCrns");
    if (!form) return null;
    return {
      inputs: () => [...form.querySelectorAll<HTMLInputElement>("input.crn-input")],
      addRow: () => {
        const button = form.querySelector<HTMLButtonElement>("#addAnotherCrn");
        if (!button) return false;
        button.click();
        return true;
      },
      nextStep: 'Check them, click "Add to Summary", then "Submit".',
    };
  },
};

/** "MWF 9:00 AM - 9:50 AM (Bear Hall 104); R 2:00 PM - 4:50 PM (Lab 2)" or "Online" */
export function parseMeetingCell(text: string): Meeting[] | null {
  const parts = text.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.every((p) => /^(online|tba|async)/i.test(p))) return [];
  const meetings: Meeting[] = [];
  for (const part of parts) {
    const location = part.match(/\(([^)]*)\)\s*$/)?.[1]?.trim();
    const parsed = parseMeetings(part.replace(/\([^)]*\)\s*$/, "").trim());
    if (parsed === null || parsed.length !== 1) return null;
    meetings.push({ ...parsed[0]!, ...(location ? { location } : {}) });
  }
  return meetings;
}
