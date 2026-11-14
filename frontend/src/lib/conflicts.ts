import type { Block, Day, Meeting, Preferences, Section } from "./types";

interface Slot {
  days: Day[];
  start: number;
  end: number;
}

export function slotsOverlap(a: Slot, b: Slot): boolean {
  if (!a.days.some((d) => b.days.includes(d))) return false;
  return a.start < b.end && b.start < a.end;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  return a.meetings.some((ma) => b.meetings.some((mb) => slotsOverlap(ma, mb)));
}

export function meetingIsValid(m: Meeting): boolean {
  return m.days.length > 0 && m.start < m.end && m.start >= 0 && m.end <= 24 * 60;
}

/**
 * Why a section can't be used under the hard constraints, or null if it can.
 * Returned as text so the UI can explain an empty result.
 */
export function rejectionReason(section: Section, blocks: Block[], prefs: Preferences): string | null {
  for (const m of section.meetings) {
    if (!meetingIsValid(m)) return "has an invalid meeting time";
    const offDay = m.days.find((d) => prefs.daysOff.includes(d));
    if (offDay) return `meets on ${offDay}, which you want off`;
    if (prefs.noClassBefore !== null && m.start < prefs.noClassBefore) return "starts too early";
    if (prefs.noClassAfter !== null && m.end > prefs.noClassAfter) return "ends too late";
    const block = blocks.find((b) => slotsOverlap(m, b));
    if (block) return `overlaps "${block.label}"`;
  }
  return null;
}
