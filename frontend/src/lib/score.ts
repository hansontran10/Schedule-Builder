import type { Pick, Preferences, ScheduleStats } from "./types";

const PASSING_TIME = 15; // gaps this short are just walking between classes
const MORNING_CUTOFF = 10 * 60;
const EVENING_CUTOFF = 17 * 60;

export function scheduleStats(picks: Pick[]): ScheduleStats {
  const byDay = new Map<string, Array<{ start: number; end: number }>>();
  for (const { section } of picks) {
    for (const m of section.meetings) {
      for (const d of m.days) {
        const list = byDay.get(d) ?? [];
        list.push({ start: m.start, end: m.end });
        byDay.set(d, list);
      }
    }
  }

  let gapMinutes = 0;
  let earlyMinutes = 0;
  let lateMinutes = 0;
  let earliestStart: number | null = null;
  let latestEnd: number | null = null;

  for (const slots of byDay.values()) {
    slots.sort((a, b) => a.start - b.start);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      earlyMinutes += Math.max(0, Math.min(s.end, MORNING_CUTOFF) - s.start);
      lateMinutes += Math.max(0, s.end - Math.max(s.start, EVENING_CUTOFF));
      earliestStart = earliestStart === null ? s.start : Math.min(earliestStart, s.start);
      latestEnd = latestEnd === null ? s.end : Math.max(latestEnd, s.end);
      if (i > 0) {
        const gap = s.start - slots[i - 1]!.end;
        if (gap > PASSING_TIME) gapMinutes += gap;
      }
    }
  }

  return { gapMinutes, daysOnCampus: byDay.size, earlyMinutes, lateMinutes, earliestStart, latestEnd };
}

/**
 * Lower is better. Each term is converted to roughly "hours of annoyance" so the weights
 * are comparable: one extra day on campus counts like two hours of gaps.
 */
export function scoreStats(stats: ScheduleStats, prefs: Preferences): number {
  const w = prefs.weights;
  return (
    w.gaps * (stats.gapMinutes / 60) +
    w.daysOnCampus * stats.daysOnCampus * 2 +
    w.earlyMornings * (stats.earlyMinutes / 60) +
    w.lateEvenings * (stats.lateMinutes / 60)
  );
}
