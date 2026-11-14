// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { adapterFor } from "./adapters";
import { demoAdapter, parseMeetingCell } from "./adapters/demo";
import type { CrnForm } from "./adapters/types";
import { fillCrns } from "./crnFill";

function load(file: string): void {
  const html = readFileSync(resolve(process.cwd(), "demo", file), "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
}

describe("adapter selection", () => {
  it("picks the demo adapter only for the demo pages", () => {
    expect(adapterFor(new URL("http://localhost:5173/demo/browse.html"))?.id).toBe("demo");
    expect(adapterFor(new URL("http://localhost:5173/"))).toBeUndefined();
    expect(adapterFor(new URL("https://example.edu/demo/browse.html"))).toBeUndefined();
  });
});

describe("demo adapter: reading class search results", () => {
  beforeEach(() => load("browse.html"));

  it("groups rows into classes with their sections", () => {
    const results = demoAdapter.readResults(document)!;
    expect(results.courses.map((c) => [c.code, c.sections.length])).toEqual([["CSC 231", 3], ["MAT 261", 2], ["PHY 201", 2], ["ENG 201", 2]]);
    expect(results.container.id).toBe("searchResults");
  });

  it("reads times, location, instructor and CRN", () => {
    const csc = demoAdapter.readResults(document)!.courses[0]!;
    expect(csc.title).toBe("Intro to Data Structures");
    expect(csc.sections[0]).toMatchObject({
      label: "001", crn: "20100", instructor: "Rivera, A",
      meetings: [{ days: ["M", "W", "F"], start: 540, end: 590, location: "Bear Hall 104" }],
    });
  });

  it("reads a lecture plus lab as two meetings, and online as none", () => {
    const { courses } = demoAdapter.readResults(document)!;
    expect(courses[2]!.sections[0]!.meetings).toEqual([
      { days: ["M", "W", "F"], start: 600, end: 650, location: "Dobo 134" },
      { days: ["R"], start: 840, end: 1010, location: "Dobo Lab 2" },
    ]);
    expect(courses[3]!.sections[1]!.meetings).toEqual([]);
  });

  it("returns null on a page with no results table", () => {
    load("register.html");
    expect(demoAdapter.readResults(document)).toBeNull();
  });
});

it("parseMeetingCell skips nothing silently: unreadable text is null", () => {
  expect(parseMeetingCell("MWF sometime")).toBeNull();
  expect(parseMeetingCell("TBA")).toEqual([]);
});

describe("filling CRNs", () => {
  function fakeForm(boxes: number, canAdd: boolean) {
    document.body.innerHTML = `<div id="f">${'<input class="c">'.repeat(boxes)}</div><button id="submit">Submit</button>`;
    let submitted = false;
    document.getElementById("submit")!.addEventListener("click", () => { submitted = true; });
    const events: string[] = [];
    document.getElementById("f")!.addEventListener("input", (e) => events.push((e.target as HTMLInputElement).value));
    const form: CrnForm = {
      inputs: () => [...document.querySelectorAll<HTMLInputElement>("input.c")],
      addRow: canAdd ? () => { document.getElementById("f")!.insertAdjacentHTML("beforeend", '<input class="c">'); return true; } : undefined,
      nextStep: "",
    };
    return { form, events, wasSubmitted: () => submitted };
  }

  it("fills each CRN, adding rows when needed, and fires input events", () => {
    const { form, events } = fakeForm(1, true);
    const result = fillCrns(form, ["20100", "20111", "20120"]);
    expect(result).toEqual({ filled: ["20100", "20111", "20120"], notFilled: [] });
    expect(form.inputs().map((i) => i.value)).toEqual(["20100", "20111", "20120"]);
    expect(events).toEqual(["20100", "20111", "20120"]);
  });

  it("reports CRNs it had no box for", () => {
    const { form } = fakeForm(2, false);
    expect(fillCrns(form, ["1", "2", "3"])).toEqual({ filled: ["1", "2"], notFilled: ["3"] });
  });

  it("keeps boxes the student already filled and skips duplicates", () => {
    const { form } = fakeForm(3, false);
    form.inputs()[0]!.value = "99999";
    fillCrns(form, ["20100", "20100"]);
    expect(form.inputs().map((i) => i.value)).toEqual(["99999", "20100", ""]);
  });

  it("never submits", () => {
    const { form, wasSubmitted } = fakeForm(1, true);
    fillCrns(form, ["20100", "20111"]);
    expect(wasSubmitted()).toBe(false);
  });

  it("finds the demo registration form", () => {
    load("register.html");
    const form = demoAdapter.crnForm(document)!;
    expect(form.inputs()).toHaveLength(1);
    load("browse.html");
    expect(demoAdapter.crnForm(document)).toBeNull();
  });
});
