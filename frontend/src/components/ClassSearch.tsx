import { useState } from "react";
import { normalizeCode } from "../lib/state";
import type { SearchReply } from "../lib/searchMessages";
import { formatTime } from "../lib/time";
import type { Course, Section } from "../lib/types";

function when(s: Section): string {
  if (s.meetings.length === 0) return "Online / no set time";
  return s.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}–${formatTime(m.end)}`).join(", ");
}
const where = (s: Section) => [...new Set(s.meetings.map((m) => m.location).filter(Boolean))].join(", ");
const isFull = (s: Section) => /^FULL/i.test(s.status ?? "");

/**
 * Type a class ("ACC 201") and pick from the school's real sections, with CRNs, times and rooms
 * already filled in. The search runs through the student's open, logged-in school tab.
 */
export function ClassSearch({ courses, onSearch, onAdd }: {
  courses: Course[];
  onSearch: (query: string) => Promise<SearchReply>;
  onAdd: (course: Course) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ courses: Course[]; skipped: string[]; school: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string | null>(null);

  const inPlanner = (course: Course, s: Section) =>
    !!courses.find((c) => normalizeCode(c.code) === normalizeCode(course.code))?.sections.some((x) => x.crn === s.crn);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const r = await onSearch(query);
      if (!r.ok) {
        setFound(null);
        setError(r.error);
        return;
      }
      setFound(r);
      // Start with every open section ticked: the planner picks the best one that fits.
      setPicked(new Set(r.courses.flatMap((c) => c.sections.filter((s) => !isFull(s)).map((s) => s.id))));
      if (r.courses.length === 0) setError(`${r.school} has no sections of ${query.trim().toUpperCase()} this term.`);
    } catch {
      setError("The search didn't finish. Reload your school's Register for Classes tab and try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addPicked() {
    if (!found) return;
    const names: string[] = [];
    for (const c of found.courses) {
      const sections = c.sections.filter((s) => picked.has(s.id));
      if (sections.length === 0) continue;
      onAdd({ ...c, sections });
      names.push(`${c.code} (${sections.length} section${sections.length === 1 ? "" : "s"})`);
    }
    setAdded(names.length ? `Added ${names.join(", ")}.` : null);
  }

  return (
    <section className="panel">
      <h2>Find a class</h2>
      <p className="hint">Type a class like ACC 201. Keep your school's Register for Classes page open in another tab while you search.</p>
      <form className="row" onSubmit={search}>
        <input aria-label="Class to find" placeholder="ACC 201" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {found && found.courses.map((c) => (
        <div key={c.code} className="course">
          <div className="course-head"><strong>{c.code}</strong>{c.title && <span className="muted"> {c.title}</span>}</div>
          <ul className="sections search-results">
            {c.sections.map((s) => {
              const already = inPlanner(c, s);
              return (
                <li key={s.id}>
                  <label className={isFull(s) ? "muted" : undefined}>
                    <input type="checkbox" checked={already || picked.has(s.id)} disabled={already} onChange={() => toggle(s.id)} />
                    <span className="mono">{s.label}</span> {when(s)}
                    {where(s) && <span className="muted"> · {where(s)}</span>}
                    {s.instructor && <span className="muted"> · {s.instructor}</span>}
                    <span className="muted"> · CRN {s.crn}</span>
                    {s.status && <span className={isFull(s) ? "error" : "muted"}> · {s.status}</span>}
                    {already && <span className="ok"> · in planner</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {found && found.skipped.length > 0 && (
        <p className="muted small">Couldn't read the times for {found.skipped.join(", ")}; check those on the school's page.</p>
      )}
      {found && found.courses.length > 0 && (
        <div className="row">
          <button type="button" onClick={addPicked} disabled={picked.size === 0}>Add ticked sections</button>
          <span className="muted small">Tick every section you'd accept; the planner finds the combination that fits.</span>
        </div>
      )}
      {added && <p className="ok">{added}</p>}
    </section>
  );
}
