import type { Course } from "../../../lib/types";

/** The class-search results on the current page, read into the planner's format. */
export interface SearchResults {
  courses: Course[];
  /** The school's own results element. Hidden while our view is shown, never removed. */
  container: HTMLElement;
  /** Something the student should know about this page, e.g. that more results are on other pages. */
  note?: string;
  /** Sections skipped because their times couldn't be read, so they're never shown wrong. */
  skipped?: string[];
  /**
   * On a registration page, the school's own Add button for each section, by CRN. Clicking it puts the
   * section in the school's registration summary (like a cart); the student still has to press Submit.
   */
  schoolAdd?: Map<string, HTMLElement>;
}

/** Classes the student is already registered for, read from the school's page. */
export interface RegisteredSchedule {
  courses: Course[];
  /** Classes the page listed but showed no meeting times for (online, or not meeting this week). */
  noTimes: string[];
}

/** The CRN boxes on the school's "Register for Classes" page. */
export interface CrnForm {
  /** Every CRN input currently on the page, in order. */
  inputs(): HTMLInputElement[];
  /** Click the school's own "add another CRN" control, if it has one. Returns false if it can't. */
  addRow?(): boolean;
  /** What to tell the student to do after we fill the boxes (the school's button names). */
  nextStep: string;
}

/**
 * Everything that is specific to one school's website. Adding a school means writing one of
 * these from a saved copy of its pages; the rest of the extension stays the same.
 */
export interface SchoolAdapter {
  id: string;
  name: string;
  /** Is this page one of this school's registration pages? */
  matches(url: URL): boolean;
  /** Classes listed on this page, or null if it isn't a class-search results page. */
  readResults(doc: Document): SearchResults | null;
  /** The CRN entry form, or null if it isn't on this page. */
  crnForm(doc: Document): CrnForm | null;
  /** The student's current registered classes, if this page shows them. */
  readRegistered?(doc: Document): RegisteredSchedule | null;
  /** CRNs currently in the school's registration summary (pending or registered), or null if it isn't on the page. */
  summaryCrns?(doc: Document): Set<string> | null;
}
