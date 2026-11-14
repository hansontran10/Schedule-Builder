/**
 * School color themes. Colors come from each school's own brand pages:
 * ECU purple from brand.ecu.edu; UNCW teal (#007680, updated July 2025) from uncw.edu;
 * UNCG navy and gold from webassets.uncg.edu. Colors only: no logos or wordmarks.
 */
export interface SchoolTheme {
  id: string;
  name: string;
  /** Any web address ending in one of these belongs to the school. */
  domains: string[];
  /** Main color (headers, main buttons) and the text color that reads on it. */
  brand: string;
  onBrand: string;
  /** Second color for highlights. */
  accent: string;
  onAccent: string;
}

export const DEFAULT_THEME: SchoolTheme = {
  id: "none", name: "No school colors", domains: [],
  brand: "#1d1d1b", onBrand: "#ffffff", accent: "#2f6fdf", onAccent: "#ffffff",
};

export const SCHOOLS: SchoolTheme[] = [
  { id: "ecu", name: "ECU", domains: ["ecu.edu"], brand: "#592A8A", onBrand: "#ffffff", accent: "#FDC82F", onAccent: "#1d1d1b" },
  { id: "uncw", name: "UNCW", domains: ["uncw.edu"], brand: "#007680", onBrand: "#ffffff", accent: "#F3E389", onAccent: "#003366" },
  { id: "uncg", name: "UNCG", domains: ["uncg.edu"], brand: "#0F2044", onBrand: "#ffffff", accent: "#FFB71B", onAccent: "#0F2044" },
];

export const SCHOOL_KEY = "schedule-builder:school";

export function themeById(id: string | undefined | null): SchoolTheme {
  return SCHOOLS.find((s) => s.id === id) ?? DEFAULT_THEME;
}

/** Which school a web address belongs to, by its domain (any subdomain counts). */
export function schoolForHost(hostname: string): SchoolTheme | undefined {
  const host = hostname.toLowerCase();
  return SCHOOLS.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`)));
}

/** CSS custom properties for a theme, used by both the planner and the school page. */
export function themeVars(t: SchoolTheme): Record<string, string> {
  return { "--brand": t.brand, "--on-brand": t.onBrand, "--accent": t.accent, "--on-accent": t.onAccent };
}
