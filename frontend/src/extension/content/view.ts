import { formatTime } from "../../lib/time";
import type { Block, Course, Schedule, Section } from "../../lib/types";
import { scheduleItems, weekCalendar, type CalItem } from "./week";
import { STYLES } from "./styles";
import type { SchoolTheme } from "../../lib/schools";
import { themeVars } from "../../lib/schools";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** A host element with a shadow root and our styles. Reused if it already exists. */
export function shadowHost(doc: Document, id: string, theme: SchoolTheme): { host: HTMLElement; root: ShadowRoot } {
  let host = doc.getElementById(id);
  if (!host) {
    host = doc.createElement("div");
    host.id = id;
    host.attachShadow({ mode: "open" });
  }
  for (const [name, value] of Object.entries(themeVars(theme))) host.style.setProperty(name, value);
  const root = host.shadowRoot!;
  root.replaceChildren(el("style", { textContent: STYLES }));
  return { host, root };
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function meetingText(section: Section): { when: string; where: string } {
  if (section.meetings.length === 0) return { when: "Online / no set time", where: "" };
  return {
    when: section.meetings.map((m) => {
      const base = `${m.days.join("")} ${formatTime(m.start)}–${formatTime(m.end)}`;
      return m.startDate && m.endDate ? `${base}  (${shortDate(m.startDate)}–${shortDate(m.endDate)})` : base;
    }).join("\n"),
    where: section.meetings.map((m) => m.location ?? "").join("\n"),
  };
}

export interface ResultsViewOptions {
  courses: Course[];
  note?: string;
  skipped?: string[];
  schoolName: string;
  /** On the Register for Classes page: the school's Add button per CRN. Absent on Browse Classes. */
  schoolAdd?: Map<string, HTMLElement>;
  /** Section already in the planner. */
  isAdded(course: Course, section: Section): boolean;
  /** Why this section can't fit with the current best schedule or busy times, or null. */
  conflictFor(course: Course, section: Section): string | null;
  /** Add to the planner; when `inSchool`, also press the school's own Add (never Submit). */
  onAdd(course: Course, sections: Section[], inSchool: boolean): void;
  best: Schedule | null;
  blocks: Block[];
  plannerCount: number;
  onOpenPlanner(): void;
  /** Starts true: our view shown, the school's hidden. */
  showingOurs: boolean;
  onToggle(): void;
  /** Message after the last Add, e.g. that it went into the school's summary. */
  flash: string | null;
}

function previewItems(course: Course, section: Section, conflict: boolean): CalItem[] {
  return section.meetings.flatMap((m) => m.days.map((day) => ({
    day, start: m.start, end: m.end, title: course.code, detail: `${section.label} · ${formatTime(m.start)}`,
    kind: conflict ? "preview-conflict" as const : "preview" as const,
  })));
}

/** The cleaner class list shown in place of the school's results table, with a calendar beside it. */
export function renderResults(root: ShadowRoot, o: ResultsViewOptions): void {
  const onRegistration = o.schoolAdd !== undefined;
  const toolbar = el("div", { className: "toolbar" },
    el("span", {}, el("strong", {}, "Schedule Builder"), ` · ${o.courses.length} class${o.courses.length === 1 ? "" : "es"} found`),
    el("button", { className: "ghost", type: "button", onclick: o.onToggle },
      o.showingOurs ? "Show the school's original list" : "Show the Schedule Builder view"),
  );
  const wrap = el("div", { className: "wrap" }, toolbar);
  if (!o.showingOurs) {
    root.append(wrap);
    return;
  }
  if (onRegistration) {
    wrap.append(el("p", { className: "note-line" },
      `"Add" puts the class on your calendar and in ${o.schoolName}'s registration summary below. Nothing is registered until you press ${o.schoolName}'s Submit.`));
  }
  if (o.note) wrap.append(el("p", { className: "note-line" }, o.note));
  if (o.skipped?.length) {
    wrap.append(el("p", { className: "note-line warn" },
      `Couldn't read the times for ${o.skipped.join(", ")}, so ${o.skipped.length === 1 ? "it isn't" : "they aren't"} shown here. Check the school's original list.`));
  }
  if (o.flash) wrap.append(el("p", { className: "note-line flash" }, o.flash));

  // Calendar column
  const calendar = weekCalendar(scheduleItems(o.best, o.blocks));
  const stats = o.best
    ? `${o.best.stats.daysOnCampus} day${o.best.stats.daysOnCampus === 1 ? "" : "s"} on campus${o.best.stats.earliestStart !== null ? ` · earliest ${formatTime(o.best.stats.earliestStart)}` : ""}`
    : "Add classes to see them here.";
  const side = el("div", { className: "side" },
    el("div", { className: "side-head" },
      el("strong", {}, o.plannerCount > 1 ? "Best schedule so far" : "Your schedule"),
      el("button", { type: "button", className: "ghost small", onclick: o.onOpenPlanner }, "Open planner")),
    el("p", { className: "muted small" }, stats),
    calendar.element,
    el("p", { className: "muted small" }, "Hover a section to preview it. Dashed red means it overlaps."),
  );

  // Cards column
  const cards = el("div", { className: "cards" });
  for (const course of o.courses) {
    const body = el("tbody");
    for (const s of course.sections) {
      const { when, where } = meetingText(s);
      const added = o.isAdded(course, s);
      const conflict = added ? null : o.conflictFor(course, s);
      const schoolButton = s.crn ? o.schoolAdd?.get(s.crn) : undefined;
      const label = added ? "Added" : onRegistration && !schoolButton ? "Add to calendar" : "Add";
      const button = el("button", {
        type: "button", className: added ? "added" : "ghost", disabled: added,
        title: onRegistration && !schoolButton && !added ? `Couldn't find ${o.schoolName}'s Add button for this section. Use the school's list or Enter CRNs to register.` : "",
        onclick: () => o.onAdd(course, [s], !!schoolButton),
      }, label);
      const whenCell = el("td", { className: "pre" }, when);
      if (conflict) whenCell.append(el("div", { className: "conflict" }, conflict));
      const row = el("tr", { className: conflict ? "has-conflict" : "" },
        el("td", { className: "mono" }, s.label), whenCell,
        el("td", { className: "muted pre" }, where), el("td", {}, s.instructor ?? ""),
        el("td", { className: "muted" }, s.status ?? ""), el("td", { className: "mono" }, s.crn ?? ""),
        el("td", {}, button));
      row.addEventListener("mouseenter", () => calendar.setPreview(previewItems(course, s, !!conflict)));
      row.addEventListener("mouseleave", () => calendar.setPreview([]));
      body.append(row);
    }
    const head = el("div", { className: "card-head" },
      el("span", {}, el("span", { className: "code" }, course.code), el("span", { className: "title" }, course.title ?? "")));
    if (!onRegistration) {
      // On Browse Classes, adding every section lets the planner pick the best one.
      const allAdded = course.sections.every((s) => o.isAdded(course, s));
      head.append(el("button", { type: "button", className: allAdded ? "added" : "", disabled: allAdded,
        onclick: () => o.onAdd(course, course.sections, false) }, allAdded ? "All sections added" : `Add all ${course.sections.length} sections`));
    }
    cards.append(el("div", { className: "card" }, head,
      el("table", {},
        el("thead", {}, el("tr", {}, ...["Section", "Days and times", "Location", "Instructor", "Seats", "CRN", ""].map((h) => el("th", {}, h)))),
        body)));
  }

  wrap.append(el("div", { className: "layout" }, cards, side));
  root.append(wrap);
}

/** Small floating bar: how many classes are in the planner, and a way to open it. */
export function renderPlannerBar(root: ShadowRoot, count: number, onOpen: () => void): void {
  root.append(el("div", { className: "bar" },
    el("span", {}, `${count} class${count === 1 ? "" : "es"} in your planner`),
    el("button", { type: "button", onclick: onOpen }, "Open planner"),
  ));
}

/** On the registration page: offer to fill the CRNs the student chose in the planner. */
export function renderFillBar(root: ShadowRoot, o: { count: number; message: string | null; onFill(): void; onDismiss(): void }): void {
  const bar = el("div", { className: "bar" });
  if (o.message) {
    bar.append(el("span", { className: "note" }, o.message), el("button", { type: "button", onclick: o.onDismiss }, "OK"));
  } else {
    bar.append(
      el("span", {}, `${o.count} CRN${o.count === 1 ? "" : "s"} from your planner`),
      el("button", { type: "button", onclick: o.onFill }, "Fill my CRNs"),
      el("button", { type: "button", className: "quiet", onclick: o.onDismiss }, "Not now"),
    );
  }
  root.append(bar);
}

/** On the registration page: offer to show the classes the student is already registered for. */
export function renderRegisteredBar(root: ShadowRoot, o: { count: number; message: string | null; onImport(): void; onOpen(): void }): void {
  const bar = el("div", { className: "bar" });
  if (o.message) {
    bar.append(el("span", { className: "note" }, o.message), el("button", { type: "button", onclick: o.onOpen }, "Open planner"));
  } else {
    bar.append(
      el("span", {}, `You're registered for ${o.count} class${o.count === 1 ? "" : "es"}`),
      el("button", { type: "button", onclick: o.onImport }, "Show in my planner"),
    );
  }
  root.append(bar);
}
