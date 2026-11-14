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

type Found = { courses: Course[]; skipped: string[]; school: string; subjects?: Array<{ code: string; name: string }>; number?: string };

function SectionRow({ s, already, ticked, onToggle }: { s: Section; already: boolean; ticked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={isFull(s) ? "muted" : undefined}>
        <input type="checkbox" checked={already || ticked} disabled={already} onChange={onToggle} />
        <span className="mono">{s.label}</span> {when(s)}
        {where(s) && <span className="muted"> · {where(s)}</span>}
        {s.instructor && <span className="muted"> · {s.instructor}</span>}
        <span className="muted"> · CRN {s.crn}</span>
        {s.status && <span className={isFull(s) ? "error" : "muted"}> · {s.status}</span>}
        {already && <span className="ok"> · in planner</span>}
      </label>
    </li>
  );
}

/**
 * Type a subject ("MATH") to browse every class in it, or a class ("MATH 0001") to go straight to
 * its sections, with CRNs, times and rooms already filled in. The search runs through the student's
 * open, logged-in school tab.
 */
export function ClassSearch({ courses, onSearch, onAdd }: {
  courses: Course[];
  onSearch: (query: string) => Promise<SearchReply>;
  onAdd: (course: Course) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  const inPlanner = (course: Course, s: Section) =>
    !!courses.find((c) => normalizeCode(c.code) === normalizeCode(course.code))?.sections.some((x) => x.crn === s.crn);

  async function run(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    setFilter("");
    try {
      const r = await onSearch(text);
      if (!r.ok) {
        setFound(null);
        setError(r.error);
        return;
      }
      setFound(r);
      // One class: start with every open section ticked (the planner picks the one that fits).
      // A whole subject: nothing ticked, the student chooses.
      setPicked(new Set(r.courses.length === 1 ? r.courses[0]!.sections.filter((s) => !isFull(s)).map((s) => s.id) : []));
      if (r.courses.length === 0 && !r.subjects?.length) setError(`${r.school} has nothing for "${text.trim().toUpperCase()}" this term. Check the subject, or try its code (like MATH or ENGL).`);
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
    setPicked(new Set());
  }

  const many = (found?.courses.length ?? 0) > 1;
  const words = filter.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const shown = (found?.courses ?? []).filter((c) => {
    const hay = `${c.code} ${normalizeCode(c.code)} ${c.title ?? ""}`.toUpperCase();
    return words.every((w) => hay.includes(w));
  });
  const sectionCount = (found?.courses ?? []).reduce((n, c) => n + c.sections.length, 0);

  return (
    <section className="panel">
      <h2>Find a class</h2>
      <p className="hint">Type a subject (MATH) to see all its classes, or a class (MATH 0001) to go straight to it. Keep your school's Register for Classes page open in another tab.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void run(query); }}>
        <input aria-label="Class to find" placeholder="MATH or MATH 0001" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {found?.subjects && found.subjects.length > 0 && (
        <div className="course">
          <p className="hint">Several subjects match. Pick one:</p>
          <ul className="subject-choices search-scroll">
            {found.subjects.map((s) => (
              <li key={s.code}>
                <button type="button" className="chip" disabled={busy} onClick={() => {
                  const next = `${s.code}${found.number ? ` ${found.number}` : ""}`;
                  setQuery(next);
                  void run(next);
                }}><span className="mono">{s.code}</span> {s.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {found && many && (
        <div className="course">
          <p className="hint">{found.courses.length} classes, {sectionCount} sections. Scroll, or narrow it down:</p>
          <input aria-label="Filter classes" placeholder="Filter by number or title (0001, algebra)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      )}
      {found && found.courses.length > 0 && (
        <div className={many ? "search-scroll" : undefined}>
          {many && shown.length === 0 && <p className="muted small">No class matches "{filter}".</p>}
          {shown.map((c) => {
            const tickedHere = c.sections.filter((s) => picked.has(s.id)).length;
            const rows = (
              <ul className="sections search-results">
                {c.sections.map((s) => <SectionRow key={s.id} s={s} already={inPlanner(c, s)} ticked={picked.has(s.id)} onToggle={() => toggle(s.id)} />)}
              </ul>
            );
            return many ? (
              <details key={c.code} className="course" open={shown.length === 1 || tickedHere > 0 || undefined}>
                <summary>
                  <strong>{c.code}</strong>{c.title && <span className="muted"> {c.title}</span>}
                  <span className="muted small"> · {c.sections.length} section{c.sections.length === 1 ? "" : "s"}{tickedHere > 0 && ` · ${tickedHere} ticked`}</span>
                </summary>
                {rows}
              </details>
            ) : (
              <div key={c.code} className="course">
                <div className="course-head"><strong>{c.code}</strong>{c.title && <span className="muted"> {c.title}</span>}</div>
                {rows}
              </div>
            );
          })}
        </div>
      )}
      {found && found.skipped.length > 0 && (
        <p className="muted small">Couldn't read the times for {found.skipped.join(", ")}; check those on the school's page.</p>
      )}
      {found && found.courses.length > 0 && (
        <div className="row">
          <button type="button" onClick={addPicked} disabled={picked.size === 0}>Add ticked sections{picked.size > 0 && ` (${picked.size})`}</button>
          <span className="muted small">Tick every section you'd accept; the planner finds the combination that fits.</span>
        </div>
      )}
      {added && <p className="ok">{added}</p>}
    </section>
  );
}
