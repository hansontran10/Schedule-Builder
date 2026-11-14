import { useEffect, useState } from "react";
import { scheduleToIcs } from "../lib/ics";
import type { Diagnostic, SolveResult } from "../lib/solver";
import { formatTime } from "../lib/time";
import type { Block, Schedule } from "../lib/types";
import { WeekGrid } from "./WeekGrid";

function explain(d: Diagnostic): string {
  switch (d.kind) {
    case "no_sections":
      return `${d.course} has no sections yet. Add at least one.`;
    case "all_sections_rejected":
      return `Every section of ${d.course} breaks a rule: ${d.reasons.map((r) => `${r.section} ${r.reason}`).join("; ")}.`;
    case "always_conflict":
      return `Every section of ${d.courses[0]} overlaps every section of ${d.courses[1]}. You can't take both this term as entered.`;
    case "no_combination":
      return "Each pair of classes can fit, but not all of them at once. Try removing a class or loosening a rule.";
  }
}

function minutesText(m: number): string {
  if (m === 0) return "no gaps";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h ? `${h}h ` : ""}${r ? `${r}m ` : ""}of gaps`.trim();
}

function statsLine(s: Schedule): string {
  const parts = [`${s.stats.daysOnCampus} day${s.stats.daysOnCampus === 1 ? "" : "s"} on campus`, minutesText(s.stats.gapMinutes)];
  if (s.stats.earliestStart !== null) parts.push(`earliest ${formatTime(s.stats.earliestStart)}`);
  if (s.stats.latestEnd !== null) parts.push(`latest ${formatTime(s.stats.latestEnd)}`);
  return parts.join(" · ");
}

interface Props {
  result: SolveResult;
  blocks: Block[];
  termStart: string;
  termEnd: string;
  onTermChange: (start: string, end: string) => void;
  /** Only in the extension: hand the CRNs to the school's registration page. */
  onSendCrns?: (crns: string[]) => Promise<string>;
}

export function Results({ result, blocks, termStart, termEnd, onTermChange, onSendCrns }: Props) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setIndex(0), [result]);

  if (result.diagnostics.length > 0 || result.schedules.length === 0) {
    return (
      <section className="panel results">
        <h2>Schedules</h2>
        {result.diagnostics.length === 0
          ? <p className="muted">Add your classes and their sections to see schedules.</p>
          : <ul className="diagnostics">{result.diagnostics.map((d, i) => <li key={i}>{explain(d)}</li>)}</ul>}
      </section>
    );
  }

  const schedule = result.schedules[Math.min(index, result.schedules.length - 1)]!;
  const crnList = schedule.picks.map((p) => p.section.crn).filter((c): c is string => !!c);
  const crns = crnList.join(", ");
  const missingCrn = schedule.picks.filter((p) => !p.section.crn).map((p) => p.course.code);

  async function copyCrns() {
    try {
      await navigator.clipboard.writeText(crns);
      setNote("CRNs copied.");
    } catch {
      setNote(`Copy these: ${crns}`);
    }
  }

  function download() {
    try {
      const ics = scheduleToIcs(schedule, termStart, termEnd);
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "schedule.ics";
      a.click();
      URL.revokeObjectURL(url);
      setNote(null);
    } catch (err) {
      setNote((err as Error).message);
    }
  }

  return (
    <section className="panel results">
      <div className="results-head">
        <h2>Schedules</h2>
        <p className="muted">
          {result.totalFound.toLocaleString()} schedule{result.totalFound === 1 ? "" : "s"} fit
          {result.truncated && " (stopped counting there)"}
          {result.totalFound > result.schedules.length && `; showing the best ${result.schedules.length}`}.
        </p>
      </div>

      <div className="pager">
        <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="Previous schedule">←</button>
        <span>#{index + 1} of {result.schedules.length}</span>
        <button type="button" onClick={() => setIndex((i) => Math.min(result.schedules.length - 1, i + 1))}
          disabled={index >= result.schedules.length - 1} aria-label="Next schedule">→</button>
        <span className="muted small">{statsLine(schedule)}</span>
      </div>

      <WeekGrid schedule={schedule} blocks={blocks} />

      <table>
        <thead><tr><th>Class</th><th>Section</th><th>CRN</th><th>Instructor</th><th>Same time</th></tr></thead>
        <tbody>
          {schedule.picks.map((p) => (
            <tr key={p.course.id}>
              <td><strong>{p.course.code}</strong>{p.course.title && <span className="muted"> {p.course.title}</span>}</td>
              <td className="mono">{p.section.label}</td>
              <td className="mono">{p.section.crn ?? ""}</td>
              <td>{p.section.instructor ?? ""}</td>
              <td className="muted">{p.alternatives.map((a) => a.label).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {onSendCrns && (
        <div className="register">
          <button type="button" disabled={crnList.length === 0} onClick={async () => setNote(await onSendCrns(crnList))}>
            Register with these CRNs
          </button>
          <span className="muted small">
            Fills them into your school's registration form. Nothing is submitted until you press the school's Submit.
            {missingCrn.length > 0 && ` No CRN yet for: ${missingCrn.join(", ")}.`}
          </span>
        </div>
      )}

      <div className="row export">
        <button type="button" onClick={copyCrns} disabled={!crns}>Copy CRNs</button>
        <label>Classes start <input type="date" value={termStart} onChange={(e) => onTermChange(e.target.value, termEnd)} /></label>
        <label>Classes end <input type="date" value={termEnd} onChange={(e) => onTermChange(termStart, e.target.value)} /></label>
        <button type="button" onClick={download}
          disabled={(!termStart || !termEnd) && !schedule.picks.every((p) => p.section.meetings.every((m) => m.startDate && m.endDate))}>
          Download .ics
        </button>
      </div>
      {note && <p className="muted small">{note}</p>}
    </section>
  );
}
