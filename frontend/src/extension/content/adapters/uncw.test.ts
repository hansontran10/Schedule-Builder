// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adapterFor } from ".";
import { fillCrns } from "../crnFill";

const BASE = "https://registration.uncw.edu/StudentRegistrationSsb/ssb";

function open(fixture: string, path: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`${BASE}${path}`);
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), "src/extension/content/adapters/fixtures", fixture), "utf8");
}

const uncw = () => adapterFor(new URL(`${BASE}/classSearch/classSearch`))!;

it("recognizes UNCW's registration site", () => {
  expect(uncw().id).toBe("uncw");
  expect(adapterFor(new URL("https://registration.uncw.edu/somewhere/else"))).toBeUndefined();
});

it("reads UNCW's class search, including a full section", () => {
  open("uncw-class-search.html", "/classSearch/classSearch");
  const r = uncw().readResults(document)!;
  expect(r.courses).toHaveLength(1);
  const bio = r.courses[0]!;
  expect(bio.code).toBe("BIO 241");
  expect(bio.title).toBe("Human Anatomy and Physiology II");
  expect(bio.sections.map((s) => [s.label, s.crn])).toEqual([["001", "22997"], ["002", "22998"]]);
  expect(bio.sections[0]!.meetings).toEqual([
    { days: ["T", "R"], start: 15 * 60 + 30, end: 16 * 60 + 45, location: "Dobo Hall 1006", startDate: "2027-01-11", endDate: "2027-05-06" },
  ]);
  expect(bio.sections[1]!.meetings[0]!.days).toEqual(["M", "W", "F"]);
  expect(bio.sections[1]!.status).toMatch(/^FULL/);
  expect(bio.sections[0]!.instructor).toBe("Plautz, Carol");
  expect(r.note).toBeUndefined(); // only one page of results
});

it("fills UNCW's CRN boxes and leaves the hidden template alone", () => {
  open("uncw-registration.html", "/classRegistration/classRegistration");
  document.querySelector("#addAnotherCRN")!.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector("#crns")!.append(document.querySelector("#crn-template > div")!.cloneNode(true));
  });
  const form = uncw().crnForm(document)!;
  expect(fillCrns(form, ["22997", "22998"]).notFilled).toEqual([]);
  expect(form.inputs().map((i) => i.value)).toEqual(["22997", "22998"]);
  expect(document.querySelector<HTMLInputElement>("#crn-template input")!.value).toBe("");
});

it("reads registered classes from UNCW's calendar (drawn at about 41.5px per hour)", () => {
  open("uncw-registration.html", "/classRegistration/classRegistration");
  const r = uncw().readRegistered!(document)!;
  expect(r.courses.map((c) => [c.code, c.sections[0]!.label, c.sections[0]!.crn])).toEqual([
    ["BIO 241", "001", "22997"], ["BIO 241", "002", "22998"], ["UNI 101", "800", "29999"],
  ]);
  expect(r.courses[0]!.sections[0]!.meetings).toEqual([{ days: ["T", "R"], start: 930, end: 1005 }]);
  expect(r.courses[1]!.sections[0]!.meetings).toEqual([{ days: ["M", "W", "F"], start: 780, end: 830 }]);
  expect(r.noTimes).toEqual(["UNI 101 800"]);
});

it("shows cards on Register for Classes > Find Classes and finds the school's Add button per section", () => {
  open("uncw-find-classes.html", "/classRegistration/classRegistration");
  const r = uncw().readResults(document)!;
  expect(r.courses.map((c) => c.code)).toEqual(["BIO 241"]);
  expect([...r.schoolAdd!.keys()]).toEqual(["22997", "22998"]);
  expect(r.schoolAdd!.get("22997")!.textContent).toBe("Add");
});

it("does not guess when a row has no Add button, or more than one", () => {
  open("uncw-find-classes.html", "/classRegistration/classRegistration");
  const rows = document.querySelectorAll("table#table1 tbody tr");
  rows[0]!.querySelector("button")!.remove();
  rows[1]!.querySelector("td:last-child")!.insertAdjacentHTML("beforeend", "<a href='#'>Add</a>");
  expect(uncw().readResults(document)!.schoolAdd!.size).toBe(0);
});

it("Browse Classes has no school Add buttons to press", () => {
  open("uncw-class-search.html", "/classSearch/classSearch");
  expect(uncw().readResults(document)!.schoolAdd).toBeUndefined();
});

it.each([
  ["https://banprod-reg.ecu.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration", "ecu"], // from an ECU student's address bar
  ["https://banprd-reg.ecu.edu/StudentRegistrationSsb/ssb/classSearch/classSearch", "ecu"],
  ["https://erp-registration.uncg.edu/StudentRegistrationSsb/ssb/term/termSelection", "uncg"],
  ["https://registration.uncw.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration", "uncw"],
])("any registration address under the school's domain: %s", (address, id) => {
  expect(adapterFor(new URL(address))?.id).toBe(id);
});

it.each([
  "https://banprod-reg.ecu.edu/other/page",
  "https://ecu.edu.evil.example/StudentRegistrationSsb/x",
  "https://notecu.edu/StudentRegistrationSsb/x",
  "http://banprod-reg.ecu.edu/StudentRegistrationSsb/x",
])("not %s", (address) => expect(adapterFor(new URL(address))).toBeUndefined());

describe("subject code when the row doesn't show it", () => {
  const FIND = `${BASE}/classRegistration/classRegistration`;
  function rowsWith(setup: (doc: Document) => void) {
    open("uncw-find-classes.html", "/classRegistration/classRegistration");
    setup(document);
    return adapterFor(new URL(FIND))!.readResults(document)!.courses.map((c) => c.code);
  }
  it("uses a subject code column if the school has one", () => {
    expect(rowsWith((d) => d.querySelectorAll('td[data-property="subjectDescription"]').forEach((td) => {
      td.setAttribute("data-property", "subject"); td.textContent = "MATH";
    }))).toEqual(["MATH 241"]);
  });
  it("finds a column headed Subject, whatever its internal name (ECU)", () => {
    expect(rowsWith((d) => {
      d.querySelectorAll('[data-property="subjectDescription"]').forEach((el) => {
        el.setAttribute("data-property", "subjectCode");
        el.textContent = el.tagName === "TH" ? "Subject" : "MATH";
      });
    })).toEqual(["MATH 241"]);
  });
  it("falls back to the one subject that was searched", () => {
    expect(rowsWith((d) => {
      d.querySelectorAll('td[data-property="subjectDescription"]').forEach((td) => td.remove());
      d.querySelectorAll("#s2id_txt_subject li.select2-search-choice").forEach((li) => li.remove());
    })).toEqual(["BIO 241"]);
  });
});
