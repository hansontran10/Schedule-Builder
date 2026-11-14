import { formatTime } from "../../lib/time";
import type { Course, Section } from "../../lib/types";
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

function meetingText(section: Section): { when: string; where: string } {
  if (section.meetings.length === 0) return { when: "Online / no set time", where: "" };
  return {
    when: section.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}–${formatTime(m.end)}`).join("\n"),
    where: section.meetings.map((m) => m.location ?? "").join("\n"),
  };
}

export interface ResultsViewOptions {
  courses: Course[];
  schoolName: string;
  /** Section ids (by CRN or label key) already in the planner. */
  isAdded(course: Course, section: Section): boolean;
  onAdd(course: Course, sections: Section[]): void;
  /** Starts true: our view shown, the school's hidden. */
  showingOurs: boolean;
  onToggle(): void;
}

/** The cleaner class list shown in place of the school's results table. */
export function renderResults(root: ShadowRoot, o: ResultsViewOptions): void {
  const toolbar = el("div", { className: "toolbar" },
    el("span", {}, el("strong", {}, "Schedule Builder"), ` · ${o.courses.length} class${o.courses.length === 1 ? "" : "es"} found on this page`),
    el("button", { className: "ghost", type: "button", onclick: o.onToggle },
      o.showingOurs ? "Show the school's original list" : "Show the Schedule Builder view"),
  );
  const wrap = el("div", { className: "wrap" }, toolbar);

  if (o.showingOurs) {
    const cards = el("div", { className: "cards" });
    for (const course of o.courses) {
      const allAdded = course.sections.every((s) => o.isAdded(course, s));
      const addAll = el("button", { type: "button", className: allAdded ? "added" : "", disabled: allAdded,
        onclick: () => o.onAdd(course, course.sections) }, allAdded ? "All sections added" : `Add all ${course.sections.length} sections`);
      const body = el("tbody");
      for (const s of course.sections) {
        const { when, where } = meetingText(s);
        const added = o.isAdded(course, s);
        body.append(el("tr", {},
          el("td", { className: "mono" }, s.label),
          el("td", { className: "pre" }, when),
          el("td", { className: "muted pre" }, where),
          el("td", {}, s.instructor ?? ""),
          el("td", { className: "mono" }, s.crn ?? ""),
          el("td", {}, el("button", { type: "button", className: added ? "added" : "ghost", disabled: added,
            onclick: () => o.onAdd(course, [s]) }, added ? "Added" : "Add")),
        ));
      }
      cards.append(el("div", { className: "card" },
        el("div", { className: "card-head" },
          el("span", {}, el("span", { className: "code" }, course.code), el("span", { className: "title" }, course.title ?? "")),
          addAll),
        el("table", {},
          el("thead", {}, el("tr", {}, ...["Section", "Days and times", "Location", "Instructor", "CRN", ""].map((h) => el("th", {}, h)))),
          body),
      ));
    }
    wrap.append(cards);
  }
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
