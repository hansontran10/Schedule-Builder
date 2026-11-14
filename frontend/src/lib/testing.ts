import { parseMeetings } from "./time";
import { DEFAULT_PREFERENCES, type Course, type Preferences, type Section } from "./types";

let nextId = 0;

export function sec(label: string, meetings: string): Section {
  const parsed = parseMeetings(meetings);
  if (parsed === null) throw new Error(`bad meetings: ${meetings}`);
  return { id: `s${nextId++}`, label, meetings: parsed };
}

export function course(code: string, ...sections: Section[]): Course {
  return { id: `c${nextId++}`, code, sections };
}

export function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...overrides, weights: { ...DEFAULT_PREFERENCES.weights, ...overrides.weights } };
}
