import { describe, expect, it } from "vitest";
import { coursesFromBanner, decodeEntities, parseClassQuery, searchUrl, type BannerSection } from "./bannerApi";

const mt = (over: Record<string, unknown>) => ({
  beginTime: "0930", endTime: "1045", monday: false, tuesday: true, wednesday: false, thursday: true, friday: false, saturday: false, sunday: false,
  buildingDescription: "Bryan Building", room: "105", startDate: "01/11/2027", endDate: "04/28/2027", ...over,
});
const section = (over: Partial<BannerSection>): BannerSection => ({
  courseReferenceNumber: "20001", subject: "ACC", courseNumber: "201", sequenceNumber: "01",
  courseTitle: "Financial Accounting &amp; Reporting", seatsAvailable: 12, maximumEnrollment: 40,
  faculty: [{ displayName: "Second, Person", primaryIndicator: false }, { displayName: "Lead, Prof", primaryIndicator: true }],
  meetingsFaculty: [{ meetingTime: mt({}) }], ...over,
});

describe("parseClassQuery", () => {
  it.each([
    ["ACC201", { subject: "ACC", number: "201" }], ["acc 201", { subject: "ACC", number: "201" }],
    ["ACC-201", { subject: "ACC", number: "201" }], ["bio 241l", { subject: "BIO", number: "241L" }],
    ["csc", { subject: "CSC", number: "" }],
  ])("%s", (input, expected) => expect(parseClassQuery(input)).toEqual(expected));
  it.each(["", "201", "accounting 201 now", "A 201"])("rejects %s", (input) => expect(parseClassQuery(input)).toBeNull());
});

describe("coursesFromBanner", () => {
  it("turns Banner sections into planner sections", () => {
    const r = coursesFromBanner({ success: true, data: [section({})] });
    expect(r.skipped).toEqual([]);
    expect(r.courses).toEqual([{
      id: "banner-ACC 201", code: "ACC 201", title: "Financial Accounting & Reporting",
      sections: [{
        id: "banner-20001", label: "01", crn: "20001", instructor: "Lead, Prof; Second, Person", status: "12 of 40 seats remain.",
        meetings: [{ days: ["T", "R"], start: 570, end: 645, location: "Bryan Building 105", startDate: "2027-01-11", endDate: "2027-04-28" }],
      }],
    }]);
  });

  it("groups sections of the same class and keeps a lecture plus lab as two meetings", () => {
    const r = coursesFromBanner({ data: [
      section({}),
      section({ courseReferenceNumber: "20002", sequenceNumber: "02", meetingsFaculty: [
        { meetingTime: mt({ beginTime: "1300", endTime: "1350", tuesday: false, thursday: false, monday: true, wednesday: true, friday: true }) },
        { meetingTime: mt({ beginTime: "1400", endTime: "1650", tuesday: false, thursday: true }) },
      ] }),
    ] });
    expect(r.courses).toHaveLength(1);
    expect(r.courses[0]!.sections[1]!.meetings.map((m) => [m.days, m.start, m.end])).toEqual([[["M", "W", "F"], 780, 830], [["R"], 840, 1010]]);
  });

  it("treats a section with no days and no times as online", () => {
    const r = coursesFromBanner({ data: [section({ meetingsFaculty: [{ meetingTime: mt({ beginTime: null, endTime: null, tuesday: false, thursday: false }) }] })] });
    expect(r.courses[0]!.sections[0]!.meetings).toEqual([]);
  });

  it("skips a section whose time can't be read instead of guessing", () => {
    const r = coursesFromBanner({ data: [section({ meetingsFaculty: [{ meetingTime: mt({ beginTime: "9:30" }) }] }), section({ courseReferenceNumber: "20003", sequenceNumber: "03" })] });
    expect(r.skipped).toEqual(["ACC 201 01"]);
    expect(r.courses[0]!.sections.map((s) => s.label)).toEqual(["03"]);
  });

  it("marks full sections and handles missing seats or faculty", () => {
    const r = coursesFromBanner({ data: [
      section({ seatsAvailable: 0 }),
      section({ courseReferenceNumber: "20004", sequenceNumber: "04", seatsAvailable: undefined, faculty: [] }),
    ] });
    expect(r.courses[0]!.sections[0]!.status).toBe("FULL: 0 of 40 seats remain.");
    expect(r.courses[0]!.sections[1]).not.toHaveProperty("status");
    expect(r.courses[0]!.sections[1]).not.toHaveProperty("instructor");
  });

  it("ignores rows missing a CRN or course number, and an empty response", () => {
    expect(coursesFromBanner({ data: [section({ courseReferenceNumber: "" }), section({ courseNumber: undefined })] }).courses).toEqual([]);
    expect(coursesFromBanner({ success: false, data: null }).courses).toEqual([]);
  });
});

it("decodeEntities", () => {
  expect(decodeEntities("Art &amp; Design: &quot;Intro&quot; &#39;101&#39; &lt;3")).toBe(`Art & Design: "Intro" '101' <3`);
});

it("searchUrl uses Banner's own parameters", () => {
  const u = new URL(searchUrl("https://registration.uncw.edu", "202720", "ACC", "201", 0, 100));
  expect(u.pathname).toBe("/StudentRegistrationSsb/ssb/searchResults/searchResults");
  expect(Object.fromEntries(u.searchParams)).toMatchObject({ txt_subject: "ACC", txt_courseNumber: "201", txt_term: "202720", pageOffset: "0", pageMaxSize: "100" });
});
