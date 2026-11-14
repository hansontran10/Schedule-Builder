import { describe, expect, it } from "vitest";
import { formatTime, parseMeetings, parseTime } from "./time";

describe("parseTime", () => {
  it.each([
    ["9:30", 570], ["09:30", 570], ["9:30am", 570], ["9:30 PM", 1290], ["12:00pm", 720],
    ["12:15 am", 15], ["13:05", 785], ["9am", 540], ["5 p", 1020],
  ])("%s -> %i", (input, expected) => expect(parseTime(input)).toBe(expected));

  it.each(["", "25:00", "9:60", "13pm", "noon", "0am"])("rejects %s", (input) => expect(parseTime(input)).toBeNull());
});

it("formatTime", () => {
  expect(formatTime(570)).toBe("9:30 AM");
  expect(formatTime(720)).toBe("12:00 PM");
  expect(formatTime(5)).toBe("12:05 AM");
  expect(formatTime(1290)).toBe("9:30 PM");
});

describe("parseMeetings", () => {
  it("reads one pattern", () => {
    expect(parseMeetings("MWF 9:00-9:50")).toEqual([{ days: ["M", "W", "F"], start: 540, end: 590 }]);
  });

  it("reads several patterns and lets the start borrow pm from the end", () => {
    expect(parseMeetings("TR 2:00-3:15pm, w 6pm - 8:40pm")).toEqual([
      { days: ["T", "R"], start: 840, end: 915 },
      { days: ["W"], start: 1080, end: 1240 },
    ]);
  });

  it("does not borrow pm when that would make the start after the end", () => {
    expect(parseMeetings("MW 11:00-12:15pm")).toEqual([{ days: ["M", "W"], start: 660, end: 735 }]);
  });

  it("treats online as no meetings", () => {
    expect(parseMeetings("online")).toEqual([]);
    expect(parseMeetings("")).toEqual([]);
  });

  it.each(["MWF", "XYZ 9-10", "MW 10:00-9:00", "MW 9:00"])("rejects %s", (input) => expect(parseMeetings(input)).toBeNull());
});
