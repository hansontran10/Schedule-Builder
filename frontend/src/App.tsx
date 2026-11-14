import { useEffect, useMemo, useRef, useState } from "react";
import { BlocksEditor } from "./components/BlocksEditor";
import { ClassSearch } from "./components/ClassSearch";
import { CourseEditor } from "./components/CourseEditor";
import { mergeCourses } from "./lib/state";
import type { SearchReply, SearchSectionsMessage } from "./lib/searchMessages";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { Results } from "./components/Results";
import { exampleBlocks, exampleCourses } from "./lib/example";
import { SCHOOLS, SCHOOL_KEY, themeById, themeVars } from "./lib/schools";
import { solveBestEffort } from "./lib/bestEffort";
import { EMPTY_STATE, PENDING_KEY, STATE_KEY, getStore, isExtension, normalizeState, type PendingCrns, type SavedState } from "./lib/storage";

const store = getStore();

export default function App() {
  const [state, setState] = useState<SavedState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [schoolId, setSchoolId] = useState<string>("none");
  // The last value we wrote or received, so our own writes don't echo back as "changes".
  const lastSynced = useRef<string>("");

  useEffect(() => {
    store.get<SavedState>(STATE_KEY).then((raw) => {
      const s = normalizeState(raw);
      lastSynced.current = JSON.stringify(s);
      setState(s);
      setLoaded(true);
    });
    // Which school's colors to use: set automatically when the extension sees a school's site.
    store.get<string>(SCHOOL_KEY).then((id) => setSchoolId(themeById(id).id));
    const stopSchool = store.onChange(SCHOOL_KEY, (id) => setSchoolId(themeById(id as string).id));
    // The school page adds classes by writing to the same storage.
    const stopState = store.onChange(STATE_KEY, (raw) => {
      const s = normalizeState(raw);
      const json = JSON.stringify(s);
      if (json === lastSynced.current) return;
      lastSynced.current = json;
      setState(s);
    });
    return () => {
      stopSchool();
      stopState();
    };
  }, []);

  useEffect(() => {
    const theme = themeById(schoolId);
    for (const [name, value] of Object.entries(themeVars(theme))) document.documentElement.style.setProperty(name, value);
    document.title = theme.id === "none" ? "Schedule Builder" : `Schedule Builder · ${theme.name}`;
  }, [schoolId]);

  useEffect(() => {
    if (!loaded) return; // never overwrite saved data with the empty starting state
    const json = JSON.stringify(state);
    if (json === lastSynced.current) return;
    lastSynced.current = json;
    void store.set(STATE_KEY, state);
  }, [state, loaded]);

  const { result, leftOut } = useMemo(() => solveBestEffort(state.courses, state.blocks, state.prefs), [state.courses, state.blocks, state.prefs]);
  const set = (patch: Partial<SavedState>) => setState((s) => ({ ...s, ...patch }));

  async function sendCrns(crns: string[]): Promise<string> {
    const pending: PendingCrns = { crns, createdAt: Date.now() };
    await store.set(PENDING_KEY, pending);
    return "Ready. Open your school's Register for Classes page, go to Enter CRNs, and click \"Fill my CRNs\". Then check them and press the school's Submit.";
  }

  async function searchSchool(query: string): Promise<SearchReply> {
    const message: SearchSectionsMessage = { type: "search-sections", query };
    return (await chrome.runtime.sendMessage(message)) as SearchReply;
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Schedule Builder{schoolId !== "none" && <span className="school-tag"> · {themeById(schoolId).name}</span>}</h1>
          <p className="muted">
            {isExtension()
              ? "Search a class below, or use the Add buttons on your school's class search."
              : "Enter the sections you'd take. See every schedule that fits, best first."}
          </p>
        </div>
        <div className="row">
          <label>School colors
            <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); void store.set(SCHOOL_KEY, e.target.value); }}>
              <option value="none">None</option>
              {SCHOOLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => set({ courses: exampleCourses(), blocks: exampleBlocks() })}>Load example</button>
          <button type="button" className="secondary" onClick={() => {
            if (confirm("Clear all classes, busy times and preferences?")) setState(EMPTY_STATE);
          }}>Clear</button>
        </div>
      </header>
      <main className="layout">
        <div className="left">
          {isExtension() && (
            <ClassSearch courses={state.courses} onSearch={searchSchool}
              onAdd={(course) => setState((s) => ({ ...s, courses: mergeCourses(s.courses, [course]) }))} />
          )}
          <CourseEditor courses={state.courses} onChange={(courses) => set({ courses })} />
          <BlocksEditor blocks={state.blocks} onChange={(blocks) => set({ blocks })} />
          <PreferencesPanel prefs={state.prefs} onChange={(prefs) => set({ prefs })} />
        </div>
        <div className="right">
          <Results result={result} leftOut={leftOut}
            onRemoveCourse={(id) => setState((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id) }))}
            blocks={state.blocks} termStart={state.termStart} termEnd={state.termEnd}
            onTermChange={(termStart, termEnd) => set({ termStart, termEnd })}
            onSendCrns={isExtension() ? sendCrns : undefined} />
        </div>
      </main>
    </div>
  );
}
