import { DAYS, DAY_NAMES, type Day } from "../lib/types";

export function DayPicker({ value, onChange, days = DAYS }: { value: Day[]; onChange: (d: Day[]) => void; days?: readonly Day[] }) {
  return (
    <div className="day-picker" role="group">
      {days.map((d) => {
        const on = value.includes(d);
        return (
          <button type="button" key={d} className={on ? "chip on" : "chip"} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}>
            {DAY_NAMES[d]}
          </button>
        );
      })}
    </div>
  );
}
