import type { Day } from "./types";

/** Parse "9:30", "09:30", "9:30am", "9:30 PM", "13:05", "9am" into minutes after midnight. */
export function parseTime(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.[0];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "p" && hour !== 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** 570 -> "9:30 AM" */
export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 570 -> "09:30", for <input type="time"> */
export function toInputTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const DAY_LETTERS = new Set(["M", "T", "W", "R", "F", "S", "U"]);

/**
 * Parse quick-entry text like "MWF 9:00-9:50" or "TR 2:00pm-3:15pm, W 6pm-8:40pm".
 * Returns null if any part is unreadable. "online" or an empty string means no meetings.
 */
export function parseMeetings(input: string): Array<{ days: Day[]; start: number; end: number }> | null {
  const text = input.trim();
  if (text === "" || /^(online|async|tba)$/i.test(text)) return [];
  const result = [];
  for (const part of text.split(/[,;]/)) {
    const m = part.trim().match(/^([MTWRFSU]+)\s+(.+?)\s*-\s*(.+)$/i);
    if (!m) return null;
    const letters = m[1]!.toUpperCase().split("");
    if (!letters.every((l) => DAY_LETTERS.has(l))) return null;
    const endText = m[3]!.trim();
    let startText = m[2]!.trim();
    // "2:00-3:15pm": the start borrows the end's am/pm if it has none.
    const endMeridiem = endText.match(/(am|pm|a|p)$/i)?.[1];
    if (endMeridiem && !/(am|pm|a|p)$/i.test(startText)) {
      const startGuess = parseTime(startText + endMeridiem);
      const endValue = parseTime(endText);
      if (startGuess !== null && endValue !== null && startGuess < endValue) startText += endMeridiem;
    }
    const start = parseTime(startText);
    const end = parseTime(endText);
    if (start === null || end === null || start >= end) return null;
    result.push({ days: [...new Set(letters)] as Day[], start, end });
  }
  return result;
}
