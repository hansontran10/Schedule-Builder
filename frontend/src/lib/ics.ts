import type { Day, Schedule } from "./types";

const ICS_DAY: Record<Day, string> = { M: "MO", T: "TU", W: "WE", R: "TH", F: "FR", S: "SA", U: "SU" };
const JS_DAY: Record<Day, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2027-01-11" + 570 minutes -> "20270111T093000" (floating local time). */
function stamp(date: Date, minutes: number): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Text values must escape backslash, comma, semicolon and newlines. */
function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

/** Lines longer than 75 octets must be folded (RFC 5545). Approximated with characters. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i === 0 ? "" : " ") + line.slice(i, i + 74));
  return out.join("\r\n");
}

/**
 * Weekly recurring events for each meeting, from the first matching day on or after
 * termStart through termEnd. Times are floating (no timezone), so calendar apps show
 * them at the same clock time wherever the student is, which is what a class schedule means.
 */
export function scheduleToIcs(schedule: Schedule, termStart: string, termEnd: string, now = new Date()): string {
  const start = parseDate(termStart);
  const end = parseDate(termEnd);
  if (!(start <= end)) throw new Error("term end must be on or after term start");
  const until = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T235959`;
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Schedule Builder//EN", "CALSCALE:GREGORIAN"];
  for (const { course, section } of schedule.picks) {
    section.meetings.forEach((m, i) => {
      // First date on or after the term start that falls on one of the meeting days.
      const first = new Date(start);
      while (!m.days.some((d) => JS_DAY[d] === first.getDay())) first.setDate(first.getDate() + 1);
      if (first > end) return;
      const summary = course.title ? `${course.code}: ${course.title}` : course.code;
      const details = [`Section ${section.label}`, section.crn && `CRN ${section.crn}`, section.instructor].filter(Boolean).join(", ");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${course.id}-${section.id}-${i}@schedule-builder`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${stamp(first, m.start)}`,
        `DTEND:${stamp(first, m.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${m.days.map((d) => ICS_DAY[d]).join(",")};UNTIL=${until}`,
        fold(`SUMMARY:${escapeText(summary)}`),
        fold(`DESCRIPTION:${escapeText(details)}`),
        ...(m.location ? [fold(`LOCATION:${escapeText(m.location)}`)] : []),
        "END:VEVENT",
      );
    });
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
