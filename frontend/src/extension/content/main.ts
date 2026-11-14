import { mergeCourses, normalizeCode } from "../../lib/state";
import { SCHOOL_KEY, schoolForHost, themeById, type SchoolTheme } from "../../lib/schools";
import { PENDING_KEY, STATE_KEY, getStore, normalizeState, type PendingCrns, type SavedState } from "../../lib/storage";
import type { Course, Section } from "../../lib/types";
import { adapterFor } from "./adapters";
import type { SchoolAdapter } from "./adapters/types";
import { fillCrns } from "./crnFill";
import { renderFillBar, renderPlannerBar, renderRegisteredBar, renderResults, shadowHost } from "./view";

const RESULTS_HOST = "schedule-builder-results";
const BAR_HOST = "schedule-builder-bar";
const PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000; // stale CRNs from hours ago shouldn't pop up

const store = getStore();

async function run(adapter: SchoolAdapter, theme: SchoolTheme): Promise<void> {
  let state: SavedState = normalizeState(await store.get(STATE_KEY));
  let pending = await store.get<PendingCrns>(PENDING_KEY);
  let showingOurs = true;
  let fillMessage: string | null = null;
  let importMessage: string | null = null;
  let lastSignature = "";

  const isAdded = (course: Course, section: Section) => {
    const mine = state.courses.find((c) => normalizeCode(c.code) === normalizeCode(course.code));
    return !!mine?.sections.some((s) => (s.crn && section.crn ? s.crn === section.crn : s.label === section.label));
  };

  async function add(course: Course, sections: Section[]): Promise<void> {
    // Re-read first: the planner tab may have changed things since this page loaded.
    const latest = normalizeState(await store.get(STATE_KEY));
    state = { ...latest, courses: mergeCourses(latest.courses, [{ ...course, sections }]) };
    await store.set(STATE_KEY, state);
    render(true);
  }

  function render(force = false): void {
    const results = adapter.readResults(document);
    const form = adapter.crnForm(document);
    const registered = adapter.readRegistered?.(document) ?? null;
    const freshPending = pending && Date.now() - pending.createdAt < PENDING_MAX_AGE_MS ? pending : undefined;

    // Skip re-rendering when nothing we show has changed (the page mutates constantly).
    const signature = JSON.stringify([
      results?.courses.map((c) => [c.code, c.sections.map((s) => [s.crn, s.label])]),
      state.courses.map((c) => [c.code, c.sections.length]), showingOurs, !!form, freshPending?.crns, fillMessage,
      registered?.courses.map((c) => c.sections[0]?.crn), importMessage,
    ]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    if (results && results.courses.length > 0) {
      const { host, root } = shadowHost(document, RESULTS_HOST, theme);
      if (host.nextElementSibling !== results.container) results.container.before(host);
      results.container.style.display = showingOurs ? "none" : "";
      renderResults(root, {
        courses: results.courses, schoolName: adapter.name, isAdded, showingOurs, note: results.note, skipped: results.skipped,
        onAdd: (course, sections) => void add(course, sections),
        onToggle: () => { showingOurs = !showingOurs; render(true); },
      });
    } else {
      document.getElementById(RESULTS_HOST)?.remove();
    }

    const { host: barHost, root: barRoot } = shadowHost(document, BAR_HOST, theme);
    if (!barHost.isConnected) document.body.append(barHost);
    if (form && (freshPending || fillMessage)) {
      renderFillBar(barRoot, {
        count: freshPending?.crns.length ?? 0,
        message: fillMessage,
        onFill: () => {
          const result = fillCrns(form, freshPending!.crns);
          fillMessage = result.notFilled.length === 0
            ? `Filled ${result.filled.length} CRN${result.filled.length === 1 ? "" : "s"}. ${form.nextStep}`
            : `Filled ${result.filled.length}, but there was no box for: ${result.notFilled.join(", ")}. Type those in yourself. ${form.nextStep}`;
          pending = undefined;
          void store.remove(PENDING_KEY);
          render(true);
        },
        onDismiss: () => {
          fillMessage = null;
          pending = undefined;
          void store.remove(PENDING_KEY);
          render(true);
        },
      });
    } else if (registered && registered.courses.length > 0) {
      renderRegisteredBar(barRoot, {
        count: registered.courses.length,
        message: importMessage,
        onImport: () => {
          void (async () => {
            const latest = normalizeState(await store.get(STATE_KEY));
            state = { ...latest, courses: mergeCourses(latest.courses, registered.courses) };
            await store.set(STATE_KEY, state);
            importMessage = registered.noTimes.length
              ? `Added. ${registered.noTimes.join(", ")} had no times on the school's calendar (online, or not meeting this week).`
              : "Added to your planner.";
            render(true);
          })();
        },
        onOpen: () => void chrome.runtime.sendMessage({ type: "open-planner" }),
      });
    } else if (results || state.courses.length > 0) {
      renderPlannerBar(barRoot, state.courses.length, () => void chrome.runtime.sendMessage({ type: "open-planner" }));
    }
  }

  store.onChange(STATE_KEY, (raw) => { state = normalizeState(raw); render(); });
  store.onChange(PENDING_KEY, (raw) => {
    pending = raw as PendingCrns | undefined;
    if (pending) fillMessage = null; // new CRNs arrived; our own cleanup after filling keeps its message
    render();
  });

  // School pages load results without a page reload, so watch for changes. Ignore our own.
  let timer: number | undefined;
  new MutationObserver((mutations) => {
    const ours = (n: Node) => n instanceof HTMLElement && (n.id === RESULTS_HOST || n.id === BAR_HOST);
    if (mutations.every((m) => ours(m.target) || [...m.addedNodes, ...m.removedNodes].every(ours))) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => render(), 200);
  }).observe(document.body, { childList: true, subtree: true });

  render(true);
}

/**
 * The school comes from the site's address (anything under ecu.edu is ECU, and so on).
 * The made-up test pages can pretend to be a school with ?school=ecu so themes can be tried.
 */
async function detectTheme(url: URL, adapter: SchoolAdapter): Promise<SchoolTheme> {
  const fromHost = schoolForHost(url.hostname);
  if (fromHost) return fromHost;
  if (adapter.id === "demo") {
    const asked = url.searchParams.get("school");
    return themeById(asked ?? (await store.get<string>(SCHOOL_KEY)));
  }
  return themeById(null);
}

const url = new URL(location.href);
const adapter = adapterFor(url);
if (adapter) {
  void detectTheme(url, adapter).then((theme) => {
    // Remember it so the planner tab uses the same colors.
    if (theme.id !== "none") void store.set(SCHOOL_KEY, theme.id);
    return run(adapter, theme);
  });
}
