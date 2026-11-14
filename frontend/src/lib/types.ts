/** Days use Banner's letters: R is Thursday, U is Sunday. */
export type Day = "M" | "T" | "W" | "R" | "F" | "S" | "U";
export const DAYS: readonly Day[] = ["M", "T", "W", "R", "F", "S", "U"];
export const DAY_NAMES: Record<Day, string> = {
  M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun",
};

/** Times are minutes after midnight, so 9:30 AM is 570. */
export interface Meeting {
  days: Day[];
  start: number;
  end: number;
  location?: string;
  /**
   * First and last day this meeting happens, as "YYYY-MM-DD", when the school says.
   * Half-semester classes use these: two classes at the same time in different halves don't conflict.
   */
  startDate?: string;
  endDate?: string;
}

export interface Section {
  id: string;
  label: string; // e.g. "001"
  crn?: string;
  instructor?: string;
  /** Seats or other status text from the school, e.g. "32 of 35 seats remain." */
  status?: string;
  /** Empty means online or asynchronous: it never conflicts with anything. */
  meetings: Meeting[];
}

export interface Course {
  id: string;
  code: string; // e.g. "CSC 231"
  title?: string;
  sections: Section[];
}

/** A time the student is busy (work, practice). Treated as a hard constraint. */
export interface Block {
  id: string;
  label: string;
  days: Day[];
  start: number;
  end: number;
}

export interface Weights {
  gaps: number; // dislike long breaks between classes on the same day
  daysOnCampus: number; // prefer fewer days with class
  earlyMornings: number; // dislike classes before 10 AM
  lateEvenings: number; // dislike classes after 5 PM
}

export interface Preferences {
  /** Hard limits: sections outside these are never used. */
  noClassBefore: number | null;
  noClassAfter: number | null;
  daysOff: Day[];
  /** Soft preferences, 0 (don't care) to 3 (care a lot). Used only for ranking. */
  weights: Weights;
}

export const DEFAULT_PREFERENCES: Preferences = {
  noClassBefore: null,
  noClassAfter: null,
  daysOff: [],
  weights: { gaps: 1, daysOnCampus: 1, earlyMornings: 1, lateEvenings: 1 },
};

export interface Pick {
  course: Course;
  section: Section;
  /** Other sections of the same course that meet at exactly the same times. */
  alternatives: Section[];
}

export interface ScheduleStats {
  gapMinutes: number;
  daysOnCampus: number;
  earlyMinutes: number; // minutes of class before 10:00, summed over days
  lateMinutes: number; // minutes of class after 17:00, summed over days
  earliestStart: number | null;
  latestEnd: number | null;
}

export interface Schedule {
  picks: Pick[];
  score: number; // lower is better
  stats: ScheduleStats;
}
