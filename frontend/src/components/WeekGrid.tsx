import { formatTime } from "../lib/time";
import { DAYS, DAY_NAMES, type Block, type Day, type Schedule } from "../lib/types";

const COLORS = ["#2f6fdf", "#d9622b", "#2a9d6f", "#8b4fc9", "#c23d6b", "#b88a12", "#1f8a9e", "#5b6b2f"];
const PX_PER_HOUR = 44;

interface Item {
  key: string;
  day: Day;
  start: number;
  end: number;
  title: string;
  detail: string;
  color?: string;
  busy?: boolean;
}

export function WeekGrid({ schedule, blocks }: { schedule: Schedule; blocks: Block[] }) {
  const items: Item[] = [];
  schedule.picks.forEach(({ course, section }, i) => {
    section.meetings.forEach((m, j) =>
      m.days.forEach((d) =>
        items.push({
          key: `${course.id}-${j}-${d}`, day: d, start: m.start, end: m.end, title: course.code,
          detail: `${section.label} · ${formatTime(m.start)}–${formatTime(m.end)}`, color: COLORS[i % COLORS.length],
        }),
      ),
    );
  });
  blocks.forEach((b) => b.days.forEach((d) =>
    items.push({ key: `${b.id}-${d}`, day: d, start: b.start, end: b.end, title: b.label, detail: `${formatTime(b.start)}–${formatTime(b.end)}`, busy: true })));

  const weekend = items.some((it) => it.day === "S" || it.day === "U");
  const days = weekend ? DAYS : DAYS.slice(0, 5);
  const startHour = Math.min(8, ...items.map((it) => Math.floor(it.start / 60)));
  const endHour = Math.max(18, ...items.map((it) => Math.ceil(it.end / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = (endHour - startHour) * PX_PER_HOUR;
  const online = schedule.picks.filter((p) => p.section.meetings.length === 0);

  return (
    <div>
      <div className="week" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => <div key={d} className="week-head">{DAY_NAMES[d]}</div>)}
        <div className="hours" style={{ height }}>
          {hours.map((h) => <div key={h} style={{ height: PX_PER_HOUR }}>{formatTime(h * 60).replace(":00", "")}</div>)}
        </div>
        {days.map((d) => (
          <div key={d} className="day-col" style={{ height, backgroundSize: `100% ${PX_PER_HOUR}px` }}>
            {items.filter((it) => it.day === d).map((it) => (
              <div key={it.key} className={it.busy ? "event busy" : "event"} title={`${it.title} ${it.detail}`}
                style={{
                  top: ((it.start - startHour * 60) / 60) * PX_PER_HOUR,
                  height: Math.max(18, ((it.end - it.start) / 60) * PX_PER_HOUR - 2),
                  background: it.color,
                }}>
                <strong>{it.title}</strong>
                <span>{it.detail}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {online.length > 0 && <p className="muted small">No set meeting time: {online.map((p) => `${p.course.code} ${p.section.label}`).join(", ")}</p>}
    </div>
  );
}
