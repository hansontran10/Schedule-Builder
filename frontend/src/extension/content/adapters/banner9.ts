import type { Course, Day, Meeting, Section } from "../../../lib/types";
import type { CrnForm, RegisteredSchedule, SchoolAdapter, SearchResults } from "./types";

/**
 * Ellucian Banner 9 Student Registration Self-Service, which UNCG uses at
 * erp-registration.uncg.edu/StudentRegistrationSsb. Written from saved UNCG pages (Nov 2026).
 * UNCW and ECU also run Banner, but their pages haven't been checked yet, so they aren't listed.
 */

const DAY_LETTER: Record<string, Day> = {
  Monday: "M", Tuesday: "T", Wednesday: "W", Thursday: "R", Friday: "F", Saturday: "S", Sunday: "U",
};

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** "03 : 30 PM" -> minutes after midnight. Banner puts spaces around the colon. */
function clockToMinutes(raw: string): number | null {
  const m = raw.replace(/\s+/g, "").toUpperCase().match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return null;
  if (m[3] === "PM" && h !== 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/** "01/11/2027" -> "2027-01-11" */
function usDateToIso(raw: string | undefined): string | undefined {
  const m = raw?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

/** Each "Label: value" line under a meeting (Type, Building, Room, Start Date, End Date). */
function tooltipRows(meeting: Element): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const row of meeting.querySelectorAll(".tooltip-row")) {
    const label = text(row.querySelector("span")).replace(/:$/, "");
    rows[label] = text(row).replace(/^[^:]*:\s*/, "");
  }
  return rows;
}

/**
 * One meeting block from the Meeting Times cell. Returns:
 *  - a Meeting when it has days and readable times,
 *  - "none" when it has no days and no times (online / asynchronous),
 *  - null when it can't be read (so the section is skipped rather than shown wrong).
 */
export function readMeetingBlock(meeting: Element): Meeting | "none" | null {
  const days = [...meeting.querySelectorAll('li[aria-checked="true"]')]
    .map((li) => DAY_LETTER[li.getAttribute("data-name") ?? ""])
    .filter((d): d is Day => !!d);
  const timeSpan = [...meeting.querySelectorAll(".meeting-schedule > span")].find((s) => !s.classList.contains("ui-pillbox"));
  const times = text(timeSpan);
  if (days.length === 0 && /^-?$/.test(times)) return "none";
  const parts = times.split(/\s-\s/);
  if (days.length === 0 || parts.length !== 2) return null;
  const start = clockToMinutes(parts[0]!);
  const end = clockToMinutes(parts[1]!);
  if (start === null || end === null || start >= end) return null;
  const rows = tooltipRows(meeting);
  const where = [rows.Building, rows.Room].filter((v) => v && v !== "None").join(" ");
  const startDate = usDateToIso(rows["Start Date"]);
  const endDate = usDateToIso(rows["End Date"]);
  return {
    days, start, end,
    ...(where ? { location: where } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };
}

/**
 * Banner's results show the subject's long name ("African Amrcn/African Diaspora") but not its code.
 * The code is in the search form: the hidden #txt_subject holds "ADS,ARH" in the same order as the
 * chosen subject chips. Returns description -> code.
 */
function subjectCodes(doc: Document): Map<string, string> {
  const codes = ((doc.querySelector<HTMLInputElement>("#txt_subject")?.value ?? "")).split(",").map((c) => c.trim()).filter(Boolean);
  const names = [...doc.querySelectorAll("#s2id_txt_subject li.select2-search-choice")].map((li) => text(li.querySelector("div") ?? li));
  const map = new Map<string, string>();
  if (codes.length === names.length) names.forEach((n, i) => map.set(n, codes[i]!));
  return map;
}

function instructorNames(cell: Element | null): string | undefined {
  if (!cell) return undefined;
  const links = [...cell.querySelectorAll("a")].map(text).filter(Boolean);
  const names = links.length > 0 ? links : [text(cell).replace(/\s*\((Primary)\)\s*/g, "")].filter(Boolean);
  return names.length > 0 ? names.join("; ") : undefined;
}

function onPage(doc: Document, segment: string): boolean {
  return (doc.defaultView?.location.pathname ?? "").includes(segment);
}

/**
 * The school's own "Add" control in a Find Classes result row (Register for Classes page). Banner draws
 * these with its scripts after a search, so it's found by its label rather than an id. Returns undefined
 * when there isn't exactly one, and then the extension only adds the class to its own calendar.
 */
function schoolAddButton(row: Element): HTMLElement | undefined {
  const candidates = [...row.querySelectorAll<HTMLElement>("button, a, input[type=button]")].filter((el) => {
    const label = (el instanceof HTMLInputElement ? el.value : el.textContent ?? "").replace(/\s+/g, " ").trim();
    return /^add$/i.test(label) && !(el as HTMLButtonElement).disabled;
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

function readResults(doc: Document): SearchResults | null {
  // Browse Classes, and the Find Classes tab on Register for Classes (same Banner component).
  const onRegistration = onPage(doc, "/classRegistration/");
  if (!onPage(doc, "/classSearch/") && !onRegistration) return null;
  const table = [...doc.querySelectorAll<HTMLTableElement>("table")].find(
    (t) => t.querySelector('th[data-property="meetingTime"]') && t.querySelector('th[data-property="courseReferenceNumber"]'),
  );
  if (!table) return null;

  const codes = subjectCodes(doc);
  const byCode = new Map<string, Course>();
  const skipped: string[] = [];
  const schoolAdd = new Map<string, HTMLElement>();
  for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
    const cell = (p: string) => row.querySelector(`td[data-property="${p}"]`);
    const crn = text(cell("courseReferenceNumber"));
    if (!crn) continue;
    const subjectName = text(cell("subjectDescription"));
    const subject = codes.get(subjectName) ?? subjectName;
    const code = `${subject} ${text(cell("courseNumber"))}`.trim();
    const label = text(cell("sequenceNumber"));

    const meetings: Meeting[] = [];
    let unreadable = false;
    for (const block of cell("meetingTime")?.querySelectorAll(".meeting") ?? []) {
      const m = readMeetingBlock(block);
      if (m === null) unreadable = true;
      else if (m !== "none") meetings.push(m);
    }
    if (unreadable) {
      skipped.push(`${code} ${label}`);
      continue;
    }

    if (onRegistration) {
      const button = schoolAddButton(row);
      if (button) schoolAdd.set(crn, button);
    }

    const section: Section = {
      id: `banner-${crn}`,
      label,
      crn,
      meetings,
      ...(instructorNames(cell("instructor")) ? { instructor: instructorNames(cell("instructor"))! } : {}),
      ...(text(cell("status")) ? { status: text(cell("status")) } : {}),
    };
    const title = cell("courseTitle")?.getAttribute("title") || text(cell("courseTitle")) || undefined;
    const course = byCode.get(code) ?? { id: `banner-${code}`, code, ...(title ? { title } : {}), sections: [] };
    course.sections.push(section);
    byCode.set(code, course);
  }

  const total = Number(text(doc.querySelector(".total-pages"))) || 1;
  const records = (text(doc.querySelector(".records-info")) || text(doc.querySelector(".results-out-of"))).match(/\d+/)?.[0];
  const note = total > 1
    ? `This page shows ${records ? `part of ${records} results` : "part of the results"}. Use the school's page buttons below, or set "Per Page" to 50, to see the rest.`
    : undefined;
  return {
    courses: [...byCode.values()], container: table,
    ...(note ? { note } : {}), ...(skipped.length ? { skipped } : {}), ...(onRegistration ? { schoolAdd } : {}),
  };
}

function crnForm(doc: Document): CrnForm | null {
  const box = doc.querySelector<HTMLElement>("#crns");
  if (!box) return null;
  return {
    // Only the real boxes. #crn-template holds a hidden copy Banner clones; never fill that.
    inputs: () => [...box.querySelectorAll<HTMLInputElement>('input[type="text"]')],
    addRow: () => {
      const link = doc.querySelector<HTMLElement>("#addAnotherCRN");
      if (!link) return false;
      link.click();
      return true;
    },
    nextStep: 'Check them, click "Add to Summary", then "Submit".',
  };
}

/**
 * Calendar times have no AM/PM ("2:00 - 3:15"). Classes run roughly 8 AM to 10 PM, so 1-7 means PM,
 * 8-11 means AM, and 12 means noon. When events carry their vertical position (Banner places them at
 * a fixed number of pixels per hour), that position is used to double-check the guess.
 */
export function resolveClock(hour: number, minute: number): number {
  const h24 = hour === 12 ? 12 : hour >= 1 && hour <= 7 ? hour + 12 : hour;
  return h24 * 60 + minute;
}

function readRegistered(doc: Document): RegisteredSchedule | null {
  if (!onPage(doc, "/classRegistration/")) return null;
  const table = [...doc.querySelectorAll<HTMLTableElement>("table")].find(
    (t) => t.querySelector('th[data-property="subjectCourseSectionNumber"]') && t.querySelector('th[data-property="courseReferenceNumber"]'),
  );
  if (!table) return null;

  // Calendar blocks, grouped by CRN. Each block is one day: "Monday 2:00 - 3:15".
  type Block = { day: Day; start: number; end: number; top: number | null };
  const blocks = new Map<string, Block[]>();
  for (const ev of doc.querySelectorAll<HTMLElement>(".fc-event")) {
    const crn = ev.querySelector("a[data-attributes]")?.getAttribute("data-attributes")?.split(",")[1]?.trim();
    const m = text(ev.querySelector(".section-time-details")).match(/^(\w+)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    const day = m && DAY_LETTER[m[1]!];
    if (!crn || !m || !day) continue;
    const start = resolveClock(Number(m[2]), Number(m[3]));
    let end = resolveClock(Number(m[4]), Number(m[5]));
    if (end <= start) end += 12 * 60; // "11:00 - 12:15" style wraps
    const top = parseFloat(ev.style.top);
    blocks.set(crn, [...(blocks.get(crn) ?? []), { day, start, end, top: Number.isFinite(top) ? top : null }]);
  }

  // Cross-check AM/PM with the vertical positions: pixels per minute should be the same for every block.
  const all = [...blocks.values()].flat().filter((b) => b.top !== null && b.start > 0);
  if (all.length >= 2) {
    const ratios = all.map((b) => b.top! / b.start).sort((a, b) => a - b);
    const typical = ratios[Math.floor(ratios.length / 2)]!;
    for (const b of all) {
      const alt = b.start >= 12 * 60 ? b.start - 12 * 60 : b.start + 12 * 60;
      if (alt > 0 && Math.abs(b.top! / alt - typical) < Math.abs(b.top! / b.start - typical)) {
        const shift = alt - b.start;
        b.start += shift;
        b.end += shift;
      }
    }
  }

  const courses: Course[] = [];
  const noTimes: string[] = [];
  for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
    const cell = (p: string) => row.querySelector(`td[data-property="${p}"]`);
    const crn = text(cell("courseReferenceNumber"));
    const status = text(cell("status"));
    const details = text(cell("subjectCourseSectionNumber")).match(/^(.+?),\s*(\S+)$/); // "ADS 205, 02"
    if (!crn || !details || (status && !/registered/i.test(status))) continue;
    const [, code, label] = details;

    // Merge days that share the same times into one meeting ("Tuesday" + "Thursday" -> TR).
    const meetings: Meeting[] = [];
    for (const b of blocks.get(crn) ?? []) {
      const same = meetings.find((m) => m.start === b.start && m.end === b.end);
      if (same) {
        if (!same.days.includes(b.day)) same.days.push(b.day);
      } else meetings.push({ days: [b.day], start: b.start, end: b.end });
    }
    const order = "MTWRFSU";
    meetings.forEach((m) => m.days.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    if (meetings.length === 0) noTimes.push(`${code} ${label}`);

    const title = cell("courseTitle")?.getAttribute("title") || text(cell("courseTitle")) || undefined;
    courses.push({
      id: `banner-${code}`, code: code!, ...(title ? { title } : {}),
      sections: [{ id: `banner-${crn}`, label: label!, crn, meetings, status: "Registered" }],
    });
  }
  return { courses, noTimes };
}

/** A school's Banner 9 registration lives somewhere under its domain (e.g. banprod-reg.ecu.edu). */
export function banner9Adapter(config: { id: string; name: string; domain: string }): SchoolAdapter {
  const onDomain = (host: string) => host === config.domain || host.endsWith(`.${config.domain}`);
  return {
    id: config.id,
    name: config.name,
    matches: (url) => url.protocol === "https:" && onDomain(url.hostname.toLowerCase()) && url.pathname.startsWith("/StudentRegistrationSsb/"),
    readResults,
    crnForm,
    readRegistered,
  };
}
