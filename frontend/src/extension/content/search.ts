import { coursesFromBanner, looksLikeSubjectCode, parseClassQuery, searchUrl, subjectsFromBanner, subjectsUrl, type BannerSearchResponse, type SubjectChoice } from "../../lib/bannerApi";
import type { Course } from "../../lib/types";
import type { SearchReply } from "../../lib/searchMessages";

/**
 * Runs the same class search the school's own Find Classes page runs, from inside the school's
 * page, so it uses the student's own login. It only reads class listings; it never registers.
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export function searchTerm(doc: Document): string | null {
  const el = doc.querySelector<HTMLInputElement>("#txt_term");
  const raw = el?.getAttribute("listofsearchterms") || el?.value || "";
  const first = raw.split(",")[0]?.trim() ?? "";
  return /^\d{6}$/.test(first) ? first : null;
}

type Found = { courses: Course[]; skipped: string[]; total: number } | { error: string };

/** One search of the school's listings: a whole subject (number "") or one class. */
async function runSearch(origin: string, term: string, subject: string, number: string, headers: Record<string, string>, doFetch: typeof fetch): Promise<Found> {
  // Banner remembers the previous search per login; clear it so results aren't mixed.
  await doFetch(`${origin}/StudentRegistrationSsb/ssb/classSearch/resetDataForm`, { method: "POST", credentials: "include", headers });

  const courses: Course[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await doFetch(searchUrl(origin, term, subject, number, page * PAGE_SIZE, PAGE_SIZE), { credentials: "include", headers });
    if (!res.ok) return { error: `Your school's site answered ${res.status}. If you were logged out, log in again and retry.` };
    let body: BannerSearchResponse;
    try {
      body = (await res.json()) as BannerSearchResponse;
    } catch {
      return { error: "Your school's site didn't send class data. Log in again on the school tab and retry." };
    }
    if (body.success === false) return { error: "Your school's site refused the search. Choose the term on the school's page and retry." };
    const parsedPage = coursesFromBanner(body);
    for (const c of parsedPage.courses) {
      const same = courses.find((x) => x.code === c.code);
      if (same) same.sections.push(...c.sections);
      else courses.push(c);
    }
    skipped.push(...parsedPage.skipped);
    const got = body.data?.length ?? 0;
    total = typeof body.totalCount === "number" ? body.totalCount : total + got;
    if (got < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total) break;
  }
  if (number) {
    // "ACC 201" should not also list ACC 2010 if the school matches by prefix.
    const exact = courses.filter((c) => c.code === `${subject} ${number}`);
    if (exact.length) return { courses: exact, skipped, total };
  }
  courses.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return { courses, skipped, total };
}

/** Subjects matching what was typed ("math", "art"), from the school's own subject list. Empty if it can't be read. */
async function findSubjects(origin: string, term: string, text: string, headers: Record<string, string>, doFetch: typeof fetch): Promise<SubjectChoice[]> {
  try {
    const res = await doFetch(subjectsUrl(origin, term, text), { credentials: "include", headers });
    return res.ok ? subjectsFromBanner(await res.json()) : [];
  } catch {
    return [];
  }
}

/**
 * "MATH 0001" finds that class. "MATH" lists every class in the subject. A subject's name or part
 * of it ("mathematics", "art") is looked up in the school's subject list; several matches come back
 * as choices to pick from.
 */
export async function searchSections(
  query: string,
  school: string,
  doc: Document = document,
  doFetch: typeof fetch = (...a) => fetch(...a),
): Promise<SearchReply> {
  const parsed = parseClassQuery(query);
  if (!parsed) return { ok: false, error: 'Type a subject like "MATH", or a class like "MATH 0001".' };

  const term = searchTerm(doc);
  if (!term) return { ok: false, error: "On your school's Register for Classes page, choose the term first, then search again." };
  const token = doc.querySelector<HTMLMetaElement>('meta[name="synchronizerToken"]')?.content ?? "";
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", ...(token ? { "X-Synchronizer-Token": token } : {}) };
  const origin = doc.location?.origin ?? location.origin;

  try {
    // What was typed might already be the school's code for the subject (MATH, ENGL).
    if (looksLikeSubjectCode(parsed.subject)) {
      const found = await runSearch(origin, term, parsed.subject, parsed.number, headers, doFetch);
      if ("error" in found) return { ok: false, error: found.error };
      if (found.courses.length > 0) return { ok: true, school, ...found };
    }
    // Otherwise look it up by name in the school's subject list.
    const subjects = await findSubjects(origin, term, parsed.subject, headers, doFetch);
    const exact = subjects.filter((s) => s.code.toUpperCase() === parsed.subject || s.name.toUpperCase() === parsed.subject);
    const pick = exact.length === 1 ? exact[0]! : subjects.length === 1 ? subjects[0]! : null;
    if (pick && pick.code.toUpperCase() !== parsed.subject) {
      const found = await runSearch(origin, term, pick.code, parsed.number, headers, doFetch);
      if ("error" in found) return { ok: false, error: found.error };
      return { ok: true, school, ...found };
    }
    if (!pick && subjects.length > 1) return { ok: true, school, courses: [], skipped: [], total: 0, subjects, number: parsed.number };
    return { ok: true, school, courses: [], skipped: [], total: 0 };
  } catch {
    return { ok: false, error: "Couldn't reach your school's site. Check you're still logged in on that tab." };
  }
}
