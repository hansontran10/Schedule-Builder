/** Opens the planner in a tab: from the toolbar button, or when the school page asks. */

const PLANNER_URL = chrome.runtime.getURL("index.html");

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

chrome.action.onClicked.addListener(() => void openPlanner());

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message === "object" && message !== null && (message as { type?: string }).type === "open-planner") {
    void openPlanner();
  }
});
