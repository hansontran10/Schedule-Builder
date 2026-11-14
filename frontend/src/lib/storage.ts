import { DEFAULT_PREFERENCES, type Block, type Course, type Preferences } from "./types";

export interface SavedState {
  courses: Course[];
  blocks: Block[];
  prefs: Preferences;
  termStart: string;
  termEnd: string;
}

/** CRNs the planner handed to the school's registration page, waiting to be filled in. */
export interface PendingCrns {
  crns: string[];
  createdAt: number;
}

export const STATE_KEY = "schedule-builder:v1";
export const PENDING_KEY = "schedule-builder:pending-crns";

export const EMPTY_STATE: SavedState = { courses: [], blocks: [], prefs: DEFAULT_PREFERENCES, termStart: "", termEnd: "" };

/** Fill in anything missing, so older saved data still loads after the app changes. */
export function normalizeState(raw: unknown): SavedState {
  if (!raw || typeof raw !== "object") return EMPTY_STATE;
  const parsed = raw as Partial<SavedState>;
  return {
    ...EMPTY_STATE,
    ...parsed,
    courses: Array.isArray(parsed.courses) ? parsed.courses : [],
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    prefs: { ...DEFAULT_PREFERENCES, ...parsed.prefs, weights: { ...DEFAULT_PREFERENCES.weights, ...parsed.prefs?.weights } },
  };
}

/**
 * Where the planner keeps its data. In the extension that's chrome.storage.local, which the
 * school page (content script) and the planner page share. As a plain website (npm run dev)
 * it falls back to localStorage.
 */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Called when another page (e.g. the school page) changes a key. Returns an unsubscribe function. */
  onChange(key: string, cb: (value: unknown) => void): () => void;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

const chromeStore: Store = {
  async get<T>(key: string) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
  onChange(key, cb) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && key in changes) cb(changes[key]!.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
};

/** Browser storage can be missing, full, or blocked; the app must still work without it. */
const localStore: Store = {
  async get<T>(key: string) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not fatal: the session still works, it just won't be remembered.
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
  onChange(key, cb) {
    const listener = (e: StorageEvent) => {
      if (e.key === key) {
        try {
          cb(e.newValue === null ? undefined : JSON.parse(e.newValue));
        } catch {
          // ignore malformed values
        }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  },
};

export function getStore(): Store {
  return hasChromeStorage() ? chromeStore : localStore;
}

export function isExtension(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
