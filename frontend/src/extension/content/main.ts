import { rejectionReason, sectionsConflict } from "../../lib/conflicts";
import { solve } from "../../lib/solver";
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
  let flash: string | null = null;
  let lastSignature = "";

  const isAdded = (course: Course, section: Section) => {
    const mine = state.courses.find((c) => normalizeCode(c.code) === normalizeCode(course.code));
    return !!mine?.sections.some((s) => (s.crn && section.crn ? s.crn === section.crn : s.label === section.label));
  };

  async function add(course: Course, sections: Section[], inSchool: boolean, schoolAdd?: Map<string, HTMLElement>): Promise<void> {
    // Re-read first: the planner tab may have changed things since this page loaded.
    const latest = normalizeState(await store.get(STATE_KEY));
    state = { ...latest, courses: mergeCourses(latest.courses, [{ ...course, sections }]) };
    await store.set(STATE_KEY, state);
    const label = `${course.code} ${sections.map((s) => s.label).join(", ")}`;
    if (inSchool) {
      // Press the school's own Add for this section: it goes into the school's registration summary.
      // Never Submit; the student does that on the school's page.
      const button = sections[0]?.crn ? schoolAdd?.get(sections[0].crn) : undefined;
      if (button?.isConnected) {
        button.click();
        flash = `${label} added to your calendar and to ${adapter.name}'s summary. Press ${adapter.name}'s Submit when you're ready to register.`;
      } else {
        flash = `${label} added to your calendar. ${adapter.name}'s Add button wasn't available, so add it in the school's list or Enter CRNs to register.`;
      }
    } else {
      flash = `${label} added to your calendar.`;
    }
    render(true);
  }

  /** Best schedule from everything in the planner, for the calendar beside the results. */
  function bestSchedule() {
    return solve(state.courses, state.blocks, state.prefs, { keep: 1, maxSchedules: 20_000 }).schedules[0] ?? null;
  }

  function conflictFor(best: ReturnType<typeof bestSchedule>) {
    return (course: Course, section: Section): string | null => {
      const busy = rejectionReason(section, state.blocks, state.prefs);
      if (busy) return busy.charAt(0).toUpperCase() + busy.slice(1);
      const clash = best?.picks.find((p) => normalizeCode(p.course.code) !== normalizeCode(course.code) && sectionsConflict(p.section, section));
      return clash ? `Overlaps ${clash.course.code} ${clash.section.label}` : null;
    };
  }

  function render(force = false): void {
    const results = adapter.readResults(document);
    const form = adapter.crnForm(document);
    const registered = adapter.readRegistered?.(document) ?? null;
    const freshPending = pending && Date.now() - pending.createdAt < PENDING_MAX_AGE_MS ? pending : undefined;

    // Skip re-rendering when nothing we show has changed (the page mutates constantly).
    const signature = JSON.stringify([
      results?.courses.map((c) => [c.code, c.sections.map((s) => [s.crn, s.label])]),
      state, showingOurs, !!form, freshPending?.crns, fillMessage, flash,
      registered?.courses.map((c) => c.sections[0]?.crn), importMessage, results ? [...(results.schoolAdd?.keys() ?? [])] : null,
    ]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    if (results && results.courses.length > 0) {
      const { host, root } = shadowHost(document, RESULTS_HOST, theme);
      if (host.nextElementSibling !== results.container) results.container.before(host);
      results.container.style.display = showingOurs ? "none" : "";
      const best = bestSchedule();
      renderResults(root, {
        courses: results.courses, schoolName: adapter.name, isAdded, showingOurs, note: results.note, skipped: results.skipped,
        ...(results.schoolAdd ? { schoolAdd: results.schoolAdd } : {}),
        conflictFor: conflictFor(best), best, blocks: state.blocks, plannerCount: state.courses.length, flash,
        onAdd: (course, sections, inSchool) => void add(course, sections, inSchool, results.schoolAdd),
        onOpenPlanner: () => void chrome.runtime.sendMessage({ type: "open-planner" }),
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
    } else if (!results?.courses.length && state.courses.length > 0) {
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
