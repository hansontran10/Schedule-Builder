import type { Course } from "../../../lib/types";

/** The class-search results on the current page, read into the planner's format. */
export interface SearchResults {
  courses: Course[];
  /** The school's own results element. Hidden while our view is shown, never removed. */
  container: HTMLElement;
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
}
