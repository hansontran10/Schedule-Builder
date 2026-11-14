// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { searchSections, searchTerm } from "./search";

function page(term = "202701", token = "tok-123"): Document {
  const doc = document.implementation.createHTMLDocument("x");
  doc.head.innerHTML = `<meta name="synchronizerToken" content="${token}">`;
  doc.body.innerHTML = `<input id="txt_term" type="hidden" listofsearchterms="${term}">`;
  Object.defineProperty(doc, "location", { value: new URL("https://erp-registration.uncg.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration") });
  return doc;
}

const row = (crn: string, seq: string, number = "201") => ({
  courseReferenceNumber: crn, subject: "ACC", courseNumber: number, sequenceNumber: seq, courseTitle: "Financial Accounting",
  seatsAvailable: 3, maximumEnrollment: 30, faculty: [],
  meetingsFaculty: [{ meetingTime: { beginTime: "0800", endTime: "0850", monday: true, wednesday: true, friday: true } }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("searchSections", () => {
  it("resets, then searches with the page's term and token, and returns sections", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 2, data: [row("1", "01"), row("2", "02")] }));
    const r = await searchSections("acc201", "uncg", page(), f);
    expect(r).toMatchObject({ ok: true, school: "uncg", total: 2 });
    if (!r.ok) return;
    expect(r.courses[0]!.sections.map((s) => s.crn)).toEqual(["1", "2"]);
    const [resetUrl, resetInit] = f.mock.calls[0]!;
    expect(String(resetUrl)).toBe("https://erp-registration.uncg.edu/StudentRegistrationSsb/ssb/classSearch/resetDataForm");
    expect(resetInit).toMatchObject({ method: "POST", headers: { "X-Synchronizer-Token": "tok-123" } });
    const u = new URL(String(f.mock.calls[1]![0]));
    expect(u.searchParams.get("txt_term")).toBe("202701");
    expect(u.searchParams.get("txt_subject")).toBe("ACC");
  });

  it("pages until it has every section", async () => {
    const first = Array.from({ length: 100 }, (_, i) => row(String(1000 + i), String(i)));
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 101, data: first }))
      .mockResolvedValueOnce(json({ success: true, totalCount: 101, data: [row("9999", "Z")] }));
    const r = await searchSections("ACC 201", "uncg", page(), f);
    expect(r.ok && r.courses[0]!.sections).toHaveLength(101);
    expect(new URL(String(f.mock.calls[2]![0])).searchParams.get("pageOffset")).toBe("100");
  });

  it("keeps only the exact class when the school also returns longer numbers", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 2, data: [row("1", "01"), row("2", "01", "2010")] }));
    const r = await searchSections("ACC 201", "uncg", page(), f);
    expect(r.ok && r.courses.map((c) => c.code)).toEqual(["ACC 201"]);
  });

  it("rejects something that isn't a subject or class", async () => {
    const r = await searchSections("201", "uncg", page(), vi.fn());
    expect(!r.ok && r.error).toMatch(/Type a subject/);
  });

  it("a subject alone lists every class in it, in order", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 3, data: [row("3", "01", "330"), row("1", "01", "201"), row("2", "02", "201")] }));
    const r = await searchSections("acc", "uncg", page(), f);
    expect(r.ok && r.courses.map((c) => [c.code, c.sections.length])).toEqual([["ACC 201", 2], ["ACC 330", 1]]);
    expect(new URL(String(f.mock.calls[1]![0])).searchParams.get("txt_courseNumber")).toBe("");
  });

  it("looks up a subject by name and searches its code", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ code: "MATH", description: "Mathematics" }])) // get_subject
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 1, data: [{ ...row("9", "001", "0001"), subject: "MATH" }] }));
    const r = await searchSections("mathematics 0001", "ecu", page(), f);
    expect(String(f.mock.calls[0]![0])).toContain("/classSearch/get_subject?searchTerm=MATHEMATICS&term=202701");
    expect(r.ok && r.courses.map((c) => c.code)).toEqual(["MATH 0001"]);
  });

  it("falls back to the subject list when a typed code finds nothing (MAT -> MATH)", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(json({ success: true, totalCount: 0, data: [] }))
      .mockResolvedValueOnce(json([{ code: "MATH", description: "Mathematics" }]))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(json({ success: true, totalCount: 1, data: [{ ...row("9", "001", "0001"), subject: "MATH" }] }));
    const r = await searchSections("MAT", "ecu", page(), f);
    expect(r.ok && r.courses.map((c) => c.code)).toEqual(["MATH 0001"]);
  });

  it("offers the choices when several subjects match", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(json([
      { code: "ART", description: "Art" }, { code: "ARTH", description: "Art History &amp; Appreciation" },
    ]));
    const r = await searchSections("art h 2000", "ecu", page(), f);
    expect(r).toMatchObject({ ok: true, courses: [], number: "2000", subjects: [{ code: "ART", name: "Art" }, { code: "ARTH", name: "Art History & Appreciation" }] });
  });

  it("returns nothing, without failing, when the subject list can't be read", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("<html>", { status: 404 }));
    expect(await searchSections("underwater basket weaving", "ecu", page(), f)).toMatchObject({ ok: true, courses: [] });
  });

  it("explains a missing term, a logged-out tab, a refusal and a network failure", async () => {
    const noTerm = await searchSections("ACC 201", "uncg", page(""), vi.fn());
    expect(!noTerm.ok && noTerm.error).toMatch(/choose the term/);

    const html = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(new Response("<html>login</html>"));
    const loggedOut = await searchSections("ACC 201", "uncg", page(), html);
    expect(!loggedOut.ok && loggedOut.error).toMatch(/Log in again/);

    const refused = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(json({ success: false }));
    expect((await searchSections("ACC 201", "uncg", page(), refused)).ok).toBe(false);

    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network"));
    const r = await searchSections("ACC 201", "uncg", page(), down);
    expect(!r.ok && r.error).toMatch(/Couldn't reach/);
  });
});

it("searchTerm reads the term code and ignores junk", () => {
  expect(searchTerm(page("202720"))).toBe("202720");
  expect(searchTerm(page("spring"))).toBeNull();
});
