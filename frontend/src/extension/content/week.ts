import { formatTime } from "../../lib/time";
import type { Block, Day, Schedule } from "../../lib/types";

/** A small weekly calendar drawn with plain DOM inside the school-page view. */

export interface CalItem {
  day: Day;
  start: number;
  end: number;
  title: string;
  detail: string;
  kind: "class" | "busy" | "preview" | "preview-conflict";
  color?: string;
}

const COLORS = ["#2f6fdf", "#d9622b", "#2a9d6f", "#8b4fc9", "#c23d6b", "#b88a12", "#1f8a9e", "#5b6b2f"];
const DAY_LABEL: Record<Day, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
const PX_PER_HOUR = 30;

export function scheduleItems(schedule: Schedule | null, blocks: Block[]): CalItem[] {
  const items: CalItem[] = [];
  schedule?.picks.forEach(({ course, section }, i) =>
    section.meetings.forEach((m) => m.days.forEach((day) =>
      items.push({ day, start: m.start, end: m.end, title: course.code, detail: `${section.label} · ${formatTime(m.start)}`, kind: "class", color: COLORS[i % COLORS.length] }))));
  blocks.forEach((b) => b.days.forEach((day) =>
    items.push({ day, start: b.start, end: b.end, title: b.label, detail: formatTime(b.start), kind: "busy" })));
  return items;
}

export interface WeekCalendar {
  element: HTMLElement;
  /** Show where a section would land (dashed). Pass [] to clear. */
  setPreview(items: CalItem[]): void;
}

export function weekCalendar(items: CalItem[]): WeekCalendar {
  const doc = document;
  const all = () => items;
  const days: Day[] = items.some((i) => i.day === "S" || i.day === "U") ? ["M", "T", "W", "R", "F", "S", "U"] : ["M", "T", "W", "R", "F"];
  // Fixed 8 AM - 9 PM so previews never fall off the grid, widened if a class is outside it.
  const startHour = Math.min(8, ...all().map((i) => Math.floor(i.start / 60)));
  const endHour = Math.max(21, ...all().map((i) => Math.ceil(i.end / 60)));
  const height = (endHour - startHour) * PX_PER_HOUR;

  const grid = doc.createElement("div");
  grid.className = "week";
  grid.style.gridTemplateColumns = `34px repeat(${days.length}, 1fr)`;
  grid.append(doc.createElement("div"));
  for (const d of days) {
    const head = doc.createElement("div");
    head.className = "week-head";
    head.textContent = DAY_LABEL[d];
    grid.append(head);
  }
  const hours = doc.createElement("div");
  hours.className = "week-hours";
  hours.style.height = `${height}px`;
  for (let h = startHour; h < endHour; h++) {
    const label = doc.createElement("div");
    label.style.height = `${PX_PER_HOUR}px`;
    label.textContent = formatTime(h * 60).replace(":00", "").replace(" ", "");
    hours.append(label);
  }
  grid.append(hours);

  const columns = new Map<Day, HTMLElement>();
  for (const d of days) {
    const col = doc.createElement("div");
    col.className = "week-day";
    col.style.height = `${height}px`;
    col.style.backgroundSize = `100% ${PX_PER_HOUR}px`;
    columns.set(d, col);
    grid.append(col);
  }

  const place = (item: CalItem): HTMLElement | null => {
    const col = columns.get(item.day);
    if (!col) return null;
    const ev = doc.createElement("div");
    ev.className = `week-event ${item.kind}`;
    ev.style.top = `${((item.start - startHour * 60) / 60) * PX_PER_HOUR}px`;
    ev.style.height = `${Math.max(14, ((item.end - item.start) / 60) * PX_PER_HOUR - 2)}px`;
    if (item.color) ev.style.background = item.color;
    ev.title = `${item.title} ${item.detail}`;
    const t = doc.createElement("strong");
    t.textContent = item.title;
    ev.append(t);
    if ((item.end - item.start) >= 45) {
      const d = doc.createElement("span");
      d.textContent = item.detail;
      ev.append(d);
    }
    col.append(ev);
    return ev;
  };
  items.forEach(place);

  let preview: HTMLElement[] = [];
  return {
    element: grid,
    setPreview(next) {
      preview.forEach((p) => p.remove());
      preview = next.map(place).filter((p): p is HTMLElement => p !== null);
    },
  };
}
