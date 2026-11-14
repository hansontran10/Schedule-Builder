import type { Course } from "./types";

/** Messages between the planner tab, the background worker and the school's registration tab. */

/** School page -> background: "I'm a logged-in registration page that can search." */
export interface SchoolTabMessage { type: "school-tab"; school: string }
/** Planner -> background, and background -> school page. */
export interface SearchSectionsMessage { type: "search-sections"; query: string }

export type SearchReply =
  | { ok: true; school: string; courses: Course[]; skipped: string[]; total: number }
  | { ok: false; error: string };

export const NO_SCHOOL_TAB =
  "Can't reach your school's Register for Classes page. Open it in another tab (logged in, term picked). " +
  "If it's already open, refresh that tab (press F5), then search again.";

export function isMessage<T extends { type: string }>(m: unknown, type: T["type"]): m is T {
  return typeof m === "object" && m !== null && (m as { type?: unknown }).type === type;
}
