import { coursesFromBanner, parseClassQuery, searchUrl, type BannerSearchResponse } from "../../lib/bannerApi";
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

export async function searchSections(
  query: string,
  school: string,
  doc: Document = document,
  doFetch: typeof fetch = (...a) => fetch(...a),
): Promise<SearchReply> {
  const parsed = parseClassQuery(query);
  if (!parsed) return { ok: false, error: 'Type a class like "ACC 201" or "BIO241".' };
  if (!parsed.number) return { ok: false, error: `Add the course number too, like "${parsed.subject} 201".` };

  const term = searchTerm(doc);
  if (!term) return { ok: false, error: "On your school's Register for Classes page, choose the term first, then search again." };
  const token = doc.querySelector<HTMLMetaElement>('meta[name="synchronizerToken"]')?.content ?? "";
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", ...(token ? { "X-Synchronizer-Token": token } : {}) };
  const origin = doc.location?.origin ?? location.origin;

  try {
    // Banner remembers the previous search per login; clear it so results aren't mixed.
    await doFetch(`${origin}/StudentRegistrationSsb/ssb/classSearch/resetDataForm`, { method: "POST", credentials: "include", headers });

    const courses: Course[] = [];
    const skipped: string[] = [];
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await doFetch(searchUrl(origin, term, parsed.subject, parsed.number, page * PAGE_SIZE, PAGE_SIZE), { credentials: "include", headers });
      if (!res.ok) return { ok: false, error: `Your school's site answered ${res.status}. If you were logged out, log in again and retry.` };
      let body: BannerSearchResponse;
      try {
        body = (await res.json()) as BannerSearchResponse;
      } catch {
        return { ok: false, error: "Your school's site didn't send class data. Log in again on the school tab and retry." };
      }
      if (body.success === false) return { ok: false, error: "Your school's site refused the search. Choose the term on the school's page and retry." };
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
    // "ACC 201" should not also list ACC 2010 if the school matches by prefix.
    const want = `${parsed.subject} ${parsed.number}`;
    const exact = courses.filter((c) => c.code === want);
    return { ok: true, school, courses: exact.length ? exact : courses, skipped, total };
  } catch {
    return { ok: false, error: "Couldn't reach your school's site. Check you're still logged in on that tab." };
  }
}
