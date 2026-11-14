/** Opens the planner in a tab, and passes the planner's class searches to an open school tab. */
import { NO_SCHOOL_TAB, isMessage, type SchoolTabMessage, type SearchReply, type SearchSectionsMessage } from "../lib/searchMessages";

const PLANNER_URL = chrome.runtime.getURL("index.html");
const TABS_KEY = "school-tabs"; // tab ids of open school registration pages, newest last

async function openPlanner(): Promise<void> {
  // Reuse an open planner tab instead of stacking new ones. getContexts lists this
  // extension's own open pages without needing the broad "tabs" permission.
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] });
  const existing = contexts.find((c) => c.documentUrl?.startsWith(PLANNER_URL));
  if (existing && existing.tabId >= 0) {
    await chrome.tabs.update(existing.tabId, { active: true });
    if (existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: PLANNER_URL });
}

// The worker can be stopped at any time, so the list of school tabs lives in session storage.
async function schoolTabs(): Promise<number[]> {
  const got = await chrome.storage.session.get(TABS_KEY);
  return Array.isArray(got[TABS_KEY]) ? (got[TABS_KEY] as number[]) : [];
}
async function setSchoolTabs(ids: number[]): Promise<void> {
  await chrome.storage.session.set({ [TABS_KEY]: ids.slice(-10) });
}

/** Ask the newest school tab first; a tab that was closed or navigated away just doesn't answer. */
async function search(message: SearchSectionsMessage): Promise<SearchReply> {
  const ids = await schoolTabs();
  for (const id of [...ids].reverse()) {
    try {
      const reply = (await chrome.tabs.sendMessage(id, message)) as SearchReply | undefined;
      if (reply) return reply;
    } catch {
      // gone
    }
    await setSchoolTabs((await schoolTabs()).filter((x) => x !== id));
  }
  return { ok: false, error: NO_SCHOOL_TAB };
}

chrome.action.onClicked.addListener(() => void openPlanner());

chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (isMessage<{ type: "open-planner" }>(message, "open-planner")) {
    void openPlanner();
    return false;
  }
  if (isMessage<SchoolTabMessage>(message, "school-tab") && sender.tab?.id !== undefined) {
    const id = sender.tab.id;
    void schoolTabs().then((ids) => setSchoolTabs([...ids.filter((x) => x !== id), id]));
    return false;
  }
  // Only the planner page (an extension page, not a content script) may start a search.
  if (isMessage<SearchSectionsMessage>(message, "search-sections") && sender.url?.startsWith(PLANNER_URL)) {
    void search(message).then(reply);
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((id) => void schoolTabs().then((ids) => setSchoolTabs(ids.filter((x) => x !== id))));
