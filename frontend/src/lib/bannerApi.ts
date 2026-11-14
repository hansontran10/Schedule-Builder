import type { Course, Day, Meeting, Section } from "./types";

/**
 * Banner 9 class search, as used by the school's own Find Classes / Browse Classes pages:
 *   POST /StudentRegistrationSsb/ssb/classSearch/resetDataForm   (clears the previous search)
 *   GET  /StudentRegistrationSsb/ssb/searchResults/searchResults?txt_subject=ACC&txt_courseNumber=201&txt_term=202701...
 * Both endpoints appear in the saved UNCG and UNCW pages. The JSON shape below is Banner 9's
 * standard searchResults format; it has not been seen from these two schools yet, so every field
 * is read defensively and sections that can't be read are skipped, never guessed.
 */

export interface BannerMeetingTime {
  beginTime?: string | null; // "0930"
  endTime?: string | null; // "1045"
  monday?: boolean; tuesday?: boolean; wednesday?: boolean; thursday?: boolean; friday?: boolean; saturday?: boolean; sunday?: boolean;
  buildingDescription?: string | null;
  building?: string | null;
  room?: string | null;
  startDate?: string | null; // "01/11/2027"
  endDate?: string | null;
}

export interface BannerSection {
  courseReferenceNumber?: string;
  subject?: string;
  courseNumber?: string;
  sequenceNumber?: string;
  courseTitle?: string;
  seatsAvailable?: number;
  maximumEnrollment?: number;
  faculty?: Array<{ displayName?: string; primaryIndicator?: boolean }>;
  meetingsFaculty?: Array<{ meetingTime?: BannerMeetingTime | null }>;
}

export interface BannerSearchResponse {
  success?: boolean;
  totalCount?: number;
  data?: BannerSection[] | null;
}

/**
 * "ACC201", "acc 201", "ACC-201" -> a class; "acc" or "art history" -> a whole subject.
 * `subject` is what the student typed for the subject: a code (MATH) or part of its name (mathematics).
 */
export function parseClassQuery(input: string): { subject: string; number: string } | null {
  const m = input.trim().toUpperCase().replace(/\s+/g, " ").match(/^([A-Z][A-Z &/]*[A-Z])[\s-]*([0-9]{2,4}[A-Z]?)?$/);
  return m ? { subject: m[1]!, number: m[2] ?? "" } : null;
}

/** Could this be a subject code as the school writes it (MATH, ENGL, CSC)? */
export const looksLikeSubjectCode = (text: string) => /^[A-Z]{2,5}$/.test(text);

export interface SubjectChoice { code: string; name: string }

/** Banner's own subject lookup, used by the Subject box on the school's search page. */
export function subjectsUrl(origin: string, term: string, text: string): string {
  const p = new URLSearchParams({ searchTerm: text, term, offset: "1", max: "50" });
  return `${origin}/StudentRegistrationSsb/ssb/classSearch/get_subject?${p}`;
}

export function subjectsFromBanner(body: unknown): SubjectChoice[] {
  if (!Array.isArray(body)) return [];
  const out: SubjectChoice[] = [];
  for (const item of body as Array<{ code?: unknown; description?: unknown }>) {
    if (typeof item?.code !== "string" || !item.code.trim()) continue;
    out.push({ code: item.code.trim(), name: typeof item.description === "string" ? decodeEntities(item.description).trim() : item.code.trim() });
  }
  return out;
}

const DAY_FIELDS: Array<[keyof BannerMeetingTime, Day]> = [
  ["monday", "M"], ["tuesday", "T"], ["wednesday", "W"], ["thursday", "R"], ["friday", "F"], ["saturday", "S"], ["sunday", "U"],
];

function hhmm(raw: string | null | undefined): number | null {
  const m = raw?.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

function usDate(raw: string | null | undefined): string | undefined {
  const m = raw?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

/** Banner sends titles HTML-escaped ("Accounting &amp; Society"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'");
}

/** One meetingTime -> Meeting, "none" (online: no days and no times), or null (can't be read). */
function meetingFrom(mt: BannerMeetingTime): Meeting | "none" | null {
  const days = DAY_FIELDS.filter(([field]) => mt[field] === true).map(([, d]) => d);
  const start = hhmm(mt.beginTime);
  const end = hhmm(mt.endTime);
  if (days.length === 0 && start === null && end === null) return "none";
  if (days.length === 0 || start === null || end === null || start >= end) return null;
  const where = [mt.buildingDescription ?? mt.building, mt.room].filter((v) => v && v !== "None").join(" ");
  const startDate = usDate(mt.startDate);
  const endDate = usDate(mt.endDate);
  return {
    days, start, end,
    ...(where ? { location: where } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };
}

function seatsText(s: BannerSection): string | undefined {
  if (typeof s.seatsAvailable !== "number" || typeof s.maximumEnrollment !== "number") return undefined;
  const left = Math.max(0, s.seatsAvailable);
  return `${left <= 0 ? "FULL: " : ""}${left} of ${s.maximumEnrollment} seats remain.`;
}

export interface ParsedSearch {
  courses: Course[];
  /** Sections whose meeting times couldn't be read. */
  skipped: string[];
}

export function coursesFromBanner(response: BannerSearchResponse): ParsedSearch {
  const byCode = new Map<string, Course>();
  const skipped: string[] = [];
  for (const s of response.data ?? []) {
    const crn = s.courseReferenceNumber?.trim();
    const subject = s.subject?.trim();
    const number = s.courseNumber?.trim();
    if (!crn || !subject || !number) continue;
    const code = `${subject} ${number}`;
    const label = s.sequenceNumber?.trim() || crn;

    const meetings: Meeting[] = [];
    let unreadable = false;
    for (const mf of s.meetingsFaculty ?? []) {
      if (!mf.meetingTime) continue;
      const m = meetingFrom(mf.meetingTime);
      if (m === null) unreadable = true;
      else if (m !== "none") meetings.push(m);
    }
    if (unreadable) {
      skipped.push(`${code} ${label}`);
      continue;
    }

    const faculty = s.faculty ?? [];
    const names = [...faculty.filter((f) => f.primaryIndicator), ...faculty.filter((f) => !f.primaryIndicator)]
      .map((f) => f.displayName?.trim()).filter((n): n is string => !!n);
    const status = seatsText(s);
    const section: Section = {
      id: `banner-${crn}`, label, crn, meetings,
      ...(names.length ? { instructor: [...new Set(names)].join("; ") } : {}),
      ...(status ? { status } : {}),
    };
    const title = s.courseTitle ? decodeEntities(s.courseTitle) : undefined;
    const course = byCode.get(code) ?? { id: `banner-${code}`, code, ...(title ? { title } : {}), sections: [] };
    course.sections.push(section);
    byCode.set(code, course);
  }
  return { courses: [...byCode.values()], skipped };
}

export function searchUrl(origin: string, term: string, subject: string, number: string, offset: number, max: number): string {
  const p = new URLSearchParams({
    txt_subject: subject,
    txt_courseNumber: number,
    txt_term: term,
    startDatepicker: "",
    endDatepicker: "",
    pageOffset: String(offset),
    pageMaxSize: String(max),
    sortColumn: "subjectDescription",
    sortDirection: "asc",
  });
  return `${origin}/StudentRegistrationSsb/ssb/searchResults/searchResults?${p}`;
}
