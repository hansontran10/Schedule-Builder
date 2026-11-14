import { useState } from "react";
import { newId } from "../lib/storage";
import { formatTime, parseMeetings } from "../lib/time";
import type { Course, Section } from "../lib/types";

function describeMeetings(section: Section): string {
  if (section.meetings.length === 0) return "Online / no set time";
  return section.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}–${formatTime(m.end)}`).join(", ");
}

function SectionForm({ onAdd }: { onAdd: (s: Section) => void }) {
  const [label, setLabel] = useState("");
  const [times, setTimes] = useState("");
  const [crn, setCrn] = useState("");
  const [instructor, setInstructor] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const meetings = parseMeetings(times);
    if (meetings === null) {
      setError('Couldn\'t read the times. Try "MWF 9:00-9:50" or "TR 2:00pm-3:15pm, W 6pm-8:40pm", or "online".');
      return;
    }
    onAdd({ id: newId(), label: label.trim() || "?", crn: crn.trim() || undefined, instructor: instructor.trim() || undefined, meetings });
    setLabel("");
    setTimes("");
    setCrn("");
    setInstructor("");
    setError(null);
  }

  return (
    <form className="section-form" onSubmit={submit}>
      <input aria-label="Section" placeholder="Section (001)" value={label} onChange={(e) => setLabel(e.target.value)} className="narrow" />
      <input aria-label="Days and times" placeholder="MWF 9:00-9:50" value={times} onChange={(e) => setTimes(e.target.value)} required />
      <input aria-label="CRN" placeholder="CRN" value={crn} onChange={(e) => setCrn(e.target.value)} className="narrow" />
      <input aria-label="Instructor" placeholder="Instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)} />
      <button type="submit">Add section</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function CourseEditor({ courses, onChange }: { courses: Course[]; onChange: (c: Course[]) => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");

  const update = (id: string, fn: (c: Course) => Course) => onChange(courses.map((c) => (c.id === id ? fn(c) : c)));

  return (
    <section className="panel">
      <h2>Classes</h2>
      <p className="hint">Add each class you need, then every section you'd accept. Copy days and times from your school's class search.</p>
      <form className="row" onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        onChange([...courses, { id: newId(), code: code.trim().toUpperCase(), title: title.trim() || undefined, sections: [] }]);
        setCode("");
        setTitle("");
      }}>
        <input aria-label="Course code" placeholder="Course code (CSC 231)" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input aria-label="Course title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add class</button>
      </form>

      {courses.map((c) => (
        <div key={c.id} className="course">
          <div className="course-head">
            <strong>{c.code}</strong>{c.title && <span className="muted"> {c.title}</span>}
            <button type="button" className="link" onClick={() => {
              const name = prompt("Class code (like MATH 0001):", c.code)?.trim().toUpperCase();
              if (name) update(c.id, (x) => ({ ...x, code: name }));
            }}>Rename</button>
            <button type="button" className="link" onClick={() => onChange(courses.filter((x) => x.id !== c.id))}>Remove class</button>
          </div>
          {c.sections.length === 0 && <p className="muted small">No sections yet.</p>}
          <ul className="sections">
            {c.sections.map((s) => (
              <li key={s.id}>
                <span className="mono">{s.label}</span> {describeMeetings(s)}
                {s.crn && <span className="muted"> · CRN {s.crn}</span>}
                {s.instructor && <span className="muted"> · {s.instructor}</span>}
                <button type="button" className="link" aria-label={`Remove section ${s.label}`}
                  onClick={() => update(c.id, (x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) }))}>×</button>
              </li>
            ))}
          </ul>
          <SectionForm onAdd={(s) => update(c.id, (x) => ({ ...x, sections: [...x.sections, s] }))} />
        </div>
      ))}
    </section>
  );
}
