import { useState } from "react";
import { newId } from "../lib/storage";
import { formatTime, parseTime } from "../lib/time";
import type { Block, Day } from "../lib/types";
import { DayPicker } from "./DayPicker";

export function BlocksEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = parseTime(start);
    const en = parseTime(end);
    if (days.length === 0 || s === null || en === null || s >= en) {
      setError("Pick at least one day and a start time before the end time.");
      return;
    }
    onChange([...blocks, { id: newId(), label: label.trim() || "Busy", days, start: s, end: en }]);
    setLabel("");
    setDays([]);
    setStart("");
    setEnd("");
    setError(null);
  }

  return (
    <section className="panel">
      <h2>Busy times</h2>
      <p className="hint">Work, practice, anything a class can't overlap.</p>
      <ul className="sections">
        {blocks.map((b) => (
          <li key={b.id}>
            <strong>{b.label}</strong> {b.days.join("")} {formatTime(b.start)}–{formatTime(b.end)}
            <button type="button" className="link" aria-label={`Remove ${b.label}`} onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}>×</button>
          </li>
        ))}
      </ul>
      <form className="stack" onSubmit={submit}>
        <input aria-label="Label" placeholder="Label (Work)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <DayPicker value={days} onChange={setDays} />
        <div className="row">
          <label>From <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label>To <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          <button type="submit">Add busy time</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}
