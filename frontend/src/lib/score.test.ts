import { expect, it } from "vitest";
import { scheduleStats, scoreStats } from "./score";
import { course, prefs, sec } from "./testing";

const pick = (meetings: string) => {
  const c = course("X", sec("1", meetings));
  return { course: c, section: c.sections[0]!, alternatives: [] };
};

it("ignores passing time but counts real gaps", () => {
  const stats = scheduleStats([pick("MW 9:00-9:50"), pick("MW 10:00-10:50"), pick("M 1:00pm-1:50pm")]);
  // Monday: 10-minute gap (ignored) and 10:50 -> 1:00 (130 min). Wednesday: 10-minute gap only.
  expect(stats.gapMinutes).toBe(130);
  expect(stats.daysOnCampus).toBe(2);
});

it("counts early and late minutes per day", () => {
  const stats = scheduleStats([pick("TR 8:00-9:15"), pick("W 4:30pm-6:00pm")]);
  expect(stats.earlyMinutes).toBe(75 * 2);
  expect(stats.lateMinutes).toBe(60);
  expect(stats.earliestStart).toBe(480);
  expect(stats.latestEnd).toBe(1080);
});

it("online sections add nothing", () => {
  const stats = scheduleStats([pick("online")]);
  expect(stats).toEqual({ gapMinutes: 0, daysOnCampus: 0, earlyMinutes: 0, lateMinutes: 0, earliestStart: null, latestEnd: null });
});

it("weights of zero ignore a factor", () => {
  const stats = scheduleStats([pick("MTWRF 8:00-8:50")]);
  const none = prefs({ weights: { gaps: 0, daysOnCampus: 0, earlyMornings: 0, lateEvenings: 0 } });
  expect(scoreStats(stats, none)).toBe(0);
  expect(scoreStats(stats, prefs({ weights: { gaps: 0, daysOnCampus: 1, earlyMornings: 0, lateEvenings: 0 } }))).toBe(10);
});
