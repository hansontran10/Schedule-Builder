import { useEffect, useMemo, useRef, useState } from "react";
import { BlocksEditor } from "./components/BlocksEditor";
import { CourseEditor } from "./components/CourseEditor";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { Results } from "./components/Results";
import { exampleBlocks, exampleCourses } from "./lib/example";
import { solve } from "./lib/solver";
import { EMPTY_STATE, PENDING_KEY, STATE_KEY, getStore, isExtension, normalizeState, type PendingCrns, type SavedState } from "./lib/storage";

const store = getStore();

export default function App() {
  const [state, setState] = useState<SavedState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  // The last value we wrote or received, so our own writes don't echo back as "changes".
  const lastSynced = useRef<string>("");

  useEffect(() => {
    store.get<SavedState>(STATE_KEY).then((raw) => {
      const s = normalizeState(raw);
      lastSynced.current = JSON.stringify(s);
      setState(s);
      setLoaded(true);
    });
    // The school page adds classes by writing to the same storage.
    return store.onChange(STATE_KEY, (raw) => {
      const s = normalizeState(raw);
      const json = JSON.stringify(s);
      if (json === lastSynced.current) return;
      lastSynced.current = json;
      setState(s);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return; // never overwrite saved data with the empty starting state
    const json = JSON.stringify(state);
    if (json === lastSynced.current) return;
    lastSynced.current = json;
    void store.set(STATE_KEY, state);
  }, [state, loaded]);

  const result = useMemo(() => solve(state.courses, state.blocks, state.prefs), [state.courses, state.blocks, state.prefs]);
  const set = (patch: Partial<SavedState>) => setState((s) => ({ ...s, ...patch }));

  async function sendCrns(crns: string[]): Promise<string> {
    const pending: PendingCrns = { crns, createdAt: Date.now() };
    await store.set(PENDING_KEY, pending);
    return "Ready. Open your school's Register for Classes page, go to Enter CRNs, and click \"Fill my CRNs\". Then check them and press the school's Submit.";
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Schedule Builder</h1>
          <p className="muted">
            {isExtension()
              ? "Add classes with the Add buttons on your school's class search, or type them here."
              : "Enter the sections you'd take. See every schedule that fits, best first."}
          </p>
        </div>
        <div className="row">
          <button type="button" onClick={() => set({ courses: exampleCourses(), blocks: exampleBlocks() })}>Load example</button>
          <button type="button" className="secondary" onClick={() => {
            if (confirm("Clear all classes, busy times and preferences?")) setState(EMPTY_STATE);
          }}>Clear</button>
        </div>
      </header>
      <main className="layout">
        <div className="left">
          <CourseEditor courses={state.courses} onChange={(courses) => set({ courses })} />
          <BlocksEditor blocks={state.blocks} onChange={(blocks) => set({ blocks })} />
          <PreferencesPanel prefs={state.prefs} onChange={(prefs) => set({ prefs })} />
        </div>
        <div className="right">
          <Results result={result} blocks={state.blocks} termStart={state.termStart} termEnd={state.termEnd}
            onTermChange={(termStart, termEnd) => set({ termStart, termEnd })}
            onSendCrns={isExtension() ? sendCrns : undefined} />
        </div>
      </main>
    </div>
  );
}
