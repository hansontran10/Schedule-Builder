import { parseMeetings } from "./time";
import type { Block, Course, Section } from "./types";

/** Made-up sections and CRNs for trying the app. Not real course data from any school. */
const raw: Array<[string, string, Array<[string, string]>]> = [
  ["CSC 231", "Intro to Data Structures", [["001", "MWF 9:00-9:50"], ["002", "MWF 11:00-11:50"], ["003", "TR 2:00pm-3:15pm"]]],
  ["MAT 261", "Discrete Mathematics", [["001", "MWF 8:00-8:50"], ["002", "TR 9:30-10:45"], ["003", "TR 11:00-12:15pm"]]],
  ["PHY 201", "General Physics I", [["001", "MWF 10:00-10:50, R 2:00pm-4:50pm"], ["002", "MWF 1:00pm-1:50pm, T 3:30pm-6:20pm"]]],
  ["ENG 201", "College Writing", [["001", "TR 9:30-10:45"], ["002", "MW 3:30pm-4:45pm"], ["W01", "online"]]],
  ["COM 220", "Public Speaking", [["001", "MW 12:00pm-1:15pm"], ["002", "TR 12:30pm-1:45pm"], ["003", "MW 12:00pm-1:15pm"]]],
];

export function exampleCourses(): Course[] {
  return raw.map(([code, title, sections], c) => ({
    id: `ex-${c}`,
    code,
    title,
    sections: sections.map(([label, meetings], i): Section => ({
      id: `ex-${c}-${i}`, label, crn: String(20100 + c * 10 + i), meetings: parseMeetings(meetings)!,
    })),
  }));
}

export function exampleBlocks(): Block[] {
  return [{ id: "ex-work", label: "Work", days: ["T", "R"], start: 17 * 60, end: 21 * 60 }];
}
