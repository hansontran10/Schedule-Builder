import { expect, it } from "vitest";
import { DEFAULT_THEME, schoolForHost, themeById, themeVars } from "./schools";

it("recognizes each school from any of its subdomains", () => {
  expect(schoolForHost("ssb.ecu.edu")?.id).toBe("ecu");
  expect(schoolForHost("ECU.EDU")?.id).toBe("ecu");
  expect(schoolForHost("registration.uncw.edu")?.id).toBe("uncw");
  expect(schoolForHost("banner.uncg.edu")?.id).toBe("uncg");
});

it("does not match look-alike domains", () => {
  expect(schoolForHost("notecu.edu")).toBeUndefined();
  expect(schoolForHost("ecu.edu.evil.com")).toBeUndefined();
  expect(schoolForHost("localhost")).toBeUndefined();
});

it("falls back to the plain theme", () => {
  expect(themeById("nope")).toBe(DEFAULT_THEME);
  expect(themeById(undefined)).toBe(DEFAULT_THEME);
  expect(themeVars(themeById("ecu"))["--brand"]).toBe("#592A8A");
});
