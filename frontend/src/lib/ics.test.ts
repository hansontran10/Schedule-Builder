import { expect, it } from "vitest";
import { scheduleToIcs } from "./ics";
import { course, sec } from "./testing";

const now = new Date(Date.UTC(2026, 10, 13, 12, 0, 0));

function schedule(...picks: ReturnType<typeof course>[]) {
  return { score: 0, stats: { gapMinutes: 0, daysOnCampus: 0, earlyMinutes: 0, lateMinutes: 0, earliestStart: null, latestEnd: null },
    picks: picks.map((c) => ({ course: c, section: c.sections[0]!, alternatives: [] })) };
}

it("creates a weekly event starting on the first matching day", () => {
  // Term starts Monday 2027-01-11. A TR class should start Tuesday the 12th.
  const c = course("CSC 231", { ...sec("001", "TR 2:00pm-3:15pm"), crn: "12345", instructor: "Dr. Example" });
  const ics = scheduleToIcs(schedule(c), "2027-01-11", "2027-05-07", now);
  expect(ics).toContain("DTSTART:20270112T140000");
  expect(ics).toContain("DTEND:20270112T151500");
  expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270507T235959");
  expect(ics).toContain("SUMMARY:CSC 231");
  expect(ics).toContain("DESCRIPTION:Section 001\\, CRN 12345\\, Dr. Example");
  expect(ics).toContain("DTSTAMP:20261113T120000Z");
  expect(ics.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
});

it("one event per meeting pattern, none for online sections", () => {
  const lab = course("BIO 101", sec("001", "MW 9:00-9:50, F 1:00pm-3:50pm"));
  const online = course("ENG 201", sec("W01", "online"));
  const ics = scheduleToIcs(schedule(lab, online), "2027-01-11", "2027-05-07", now);
  expect(ics.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
  expect(ics).toContain("DTSTART:20270115T130000"); // first Friday
  expect(ics).not.toContain("ENG 201");
});

it("escapes text and uses CRLF line endings", () => {
  const c = { ...course("A", sec("1", "M 9:00-9:50")), title: "Intro; with, punctuation" };
  const ics = scheduleToIcs(schedule(c), "2027-01-11", "2027-05-07", now);
  expect(ics).toContain("SUMMARY:A: Intro\\; with\\, punctuation");
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
});

it("rejects an end date before the start", () => {
  expect(() => scheduleToIcs(schedule(course("A", sec("1", "M 9:00-9:50"))), "2027-05-07", "2027-01-11", now)).toThrow();
});
