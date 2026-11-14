import { parseTime, toInputTime } from "../lib/time";
import { DAYS, type Preferences, type Weights } from "../lib/types";
import { DayPicker } from "./DayPicker";

const WEIGHT_LABELS: Record<keyof Weights, string> = {
  gaps: "Avoid long gaps between classes",
  daysOnCampus: "Fewer days on campus",
  earlyMornings: "Avoid classes before 10 AM",
  lateEvenings: "Avoid classes after 5 PM",
};
const LEVELS = ["Don't care", "A little", "Matters", "A lot"];

export function PreferencesPanel({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  return (
    <section className="panel">
      <h2>Preferences</h2>
      <h3>Rules (never broken)</h3>
      <div className="row">
        <label>No class before
          <input type="time" value={prefs.noClassBefore === null ? "" : toInputTime(prefs.noClassBefore)}
            onChange={(e) => onChange({ ...prefs, noClassBefore: e.target.value ? parseTime(e.target.value) : null })} />
        </label>
        <label>No class after
          <input type="time" value={prefs.noClassAfter === null ? "" : toInputTime(prefs.noClassAfter)}
            onChange={(e) => onChange({ ...prefs, noClassAfter: e.target.value ? parseTime(e.target.value) : null })} />
        </label>
      </div>
      <div className="stack">
        <span>Days off</span>
        <DayPicker value={prefs.daysOff} onChange={(daysOff) => onChange({ ...prefs, daysOff })} days={DAYS.slice(0, 5)} />
      </div>

      <h3>Ranking (what matters most)</h3>
      {(Object.keys(WEIGHT_LABELS) as Array<keyof Weights>).map((key) => (
        <label key={key} className="weight">
          <span>{WEIGHT_LABELS[key]}</span>
          <input type="range" min={0} max={3} step={1} value={prefs.weights[key]}
            onChange={(e) => onChange({ ...prefs, weights: { ...prefs.weights, [key]: Number(e.target.value) } })} />
          <span className="muted small">{LEVELS[prefs.weights[key]]}</span>
        </label>
      ))}
    </section>
  );
}
