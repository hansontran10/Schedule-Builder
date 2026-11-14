// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adapterFor } from ".";
import { fillCrns } from "../crnFill";
import { resolveClock } from "./banner9";

const BASE = "https://erp-registration.uncg.edu/StudentRegistrationSsb/ssb";

function open(fixture: string, path: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`${BASE}${path}`);
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), "src/extension/content/adapters/fixtures", fixture), "utf8");
}

const uncg = () => adapterFor(new URL(`${BASE}/classSearch/classSearch`))!;

describe("which pages are UNCG's", () => {
  it("matches UNCG's registration site only", () => {
    expect(uncg().id).toBe("uncg");
    expect(adapterFor(new URL(`${BASE}/classRegistration/classRegistration`))?.id).toBe("uncg");
    expect(adapterFor(new URL("https://erp-registration.uncg.edu/other/page"))).toBeUndefined();
    expect(adapterFor(new URL("http://erp-registration.uncg.edu/StudentRegistrationSsb/ssb/classSearch/classSearch"))).toBeUndefined();
    expect(adapterFor(new URL("https://uncg.edu.evil.com/StudentRegistrationSsb/ssb/classSearch/classSearch"))).toBeUndefined();
  });
});

describe("UNCG class search", () => {
  it("reads every section on the page with the real subject code", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    const r = uncg().readResults(document)!;
    expect(r.courses.map((c) => [c.code, c.sections.map((s) => s.label)])).toEqual([
      ["ADS 200", ["01", "01H"]],
      ["ADS 205", ["01", "02", "05", "07", "R03", "R04", "R06", "WR1"]],
    ]);
    expect(r.container.id).toBe("table1");
    expect(r.skipped).toBeUndefined();
  });

  it("reads times, days, room, dates, instructor, CRN and seats", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    const ads200 = uncg().readResults(document)!.courses[0]!;
    expect(ads200.title).toBe("African American Art History");
    expect(ads200.sections[0]).toEqual({
      id: "banner-10800", label: "01", crn: "10800", instructor: "Millner, Marlon", status: "32 of 35 seats remain.",
      meetings: [{ days: ["M", "W"], start: 15 * 60 + 30, end: 16 * 60 + 45, location: "Curry Building 303", startDate: "2027-01-11", endDate: "2027-04-28" }],
    });
  });

  it("keeps half-semester dates, evening classes and online sections", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    const s = uncg().readResults(document)!.courses[1]!.sections;
    expect(s[0]!.meetings[0]).toMatchObject({ days: ["T", "R"], start: 840, end: 915, startDate: "2027-03-04", endDate: "2027-05-04" });
    expect(s[2]!.meetings[0]).toMatchObject({ days: ["T"], start: 18 * 60, end: 20 * 60 + 50 });
    expect(s[3]!.meetings[0]!.days).toEqual(["M", "W", "F"]);
    expect(s[4]!.meetings).toEqual([]); // R03 has no meeting time
  });

  it("says when results continue on other pages", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    expect(uncg().readResults(document)!.note).toMatch(/26 results/);
  });

  it("falls back to the subject's name if the code can't be found", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    document.querySelector<HTMLInputElement>("#txt_subject")!.value = "";
    expect(uncg().readResults(document)!.courses[0]!.code).toBe("African Amrcn/African Diaspora 200");
  });

  it("skips a section whose time it can't read instead of guessing", () => {
    open("uncg-class-search.html", "/classSearch/classSearch");
    const span = [...document.querySelectorAll('td[data-property="meetingTime"] .meeting-schedule > span')].find((s) => !s.classList.contains("ui-pillbox"))!;
    span.textContent = "sometime in the afternoon";
    const r = uncg().readResults(document)!;
    expect(r.skipped).toEqual(["ADS 200 01"]);
    expect(r.courses[0]!.sections.map((s) => s.label)).toEqual(["01H"]);
  });

  it("also reads results on the Registration page's Find Classes tab", () => {
    open("uncg-class-search.html", "/classRegistration/classRegistration");
    const r = uncg().readResults(document)!;
    expect(r.courses).toHaveLength(2);
    expect(r.schoolAdd).toBeDefined(); // looked for the school's Add buttons (this saved table has none)
  });

  it("ignores pages that are neither class search nor registration", () => {
    open("uncg-class-search.html", "/registration/registration");
    expect(uncg().readResults(document)).toBeNull();
  });
});

describe("UNCG registration page", () => {
  it("fills the real CRN boxes, adds rows with Banner's own link, and skips the hidden template", () => {
    open("uncg-registration.html", "/classRegistration/classRegistration");
    // Stand in for Banner's script: "+ Add Another CRN" appends a copy of the template.
    document.querySelector("#addAnotherCRN")!.addEventListener("click", (e) => {
      e.preventDefault();
      const copy = document.querySelector("#crn-template > div")!.cloneNode(true) as HTMLElement;
      document.querySelector("#crns")!.append(copy);
    });
    const form = uncg().crnForm(document)!;
    expect(form.inputs().map((i) => i.id)).toEqual(["txt_crn1"]);
    expect(fillCrns(form, ["10802", "10800", "13747"])).toEqual({ filled: ["10802", "10800", "13747"], notFilled: [] });
    expect(form.inputs().map((i) => i.value)).toEqual(["10802", "10800", "13747"]);
    expect(document.querySelector<HTMLInputElement>("#crn-template input")!.value).toBe("");
    expect(document.querySelector("#saveButton")).toBeNull(); // nothing to submit in the fixture; we never click it anyway
  });

  it("reads the registered classes with times from the calendar", () => {
    open("uncg-registration.html", "/classRegistration/classRegistration");
    const r = uncg().readRegistered!(document)!;
    expect(r.courses.map((c) => [c.code, c.sections[0]!.label, c.sections[0]!.crn])).toEqual([
      ["ADS 205", "02", "10802"], ["ADS 200", "01", "10800"], ["ADS 205", "05", "10803"], ["ADS 205", "WR1", "13747"],
    ]);
    expect(r.courses[0]!.sections[0]!.meetings).toEqual([{ days: ["T", "R"], start: 570, end: 645 }]);
    expect(r.courses[1]!.sections[0]!.meetings).toEqual([{ days: ["M", "W"], start: 930, end: 1005 }]);
    expect(r.courses[2]!.sections[0]!.meetings).toEqual([{ days: ["T"], start: 1080, end: 1250 }]);
    expect(r.noTimes).toEqual(["ADS 205 WR1"]);
  });

  it("uses calendar positions to fix an AM/PM guess", () => {
    open("uncg-registration.html", "/classRegistration/classRegistration");
    // A 7:30 AM class: the hour alone says PM, but its position (7.5 h * 42 px) says morning.
    const ev = document.querySelector<HTMLElement>(".fc-event")!;
    ev.style.top = `${7.5 * 42}px`;
    ev.querySelector(".section-time-details")!.textContent = "Tuesday 7:30 - 8:45";
    const tr = uncg().readRegistered!(document)!.courses[0]!.sections[0]!.meetings;
    expect(tr).toContainEqual({ days: ["T"], start: 450, end: 525 });
  });

  it("is not read on the class search page", () => {
    open("uncg-registration.html", "/classSearch/classSearch");
    expect(uncg().readRegistered!(document)).toBeNull();
  });
});

it("resolveClock guesses AM/PM for typical class hours", () => {
  expect(resolveClock(8, 0)).toBe(480);
  expect(resolveClock(11, 0)).toBe(660);
  expect(resolveClock(12, 30)).toBe(750);
  expect(resolveClock(2, 0)).toBe(840);
  expect(resolveClock(7, 0)).toBe(1140);
});
