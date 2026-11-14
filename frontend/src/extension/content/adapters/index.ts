import { demoAdapter } from "./demo";
import type { SchoolAdapter } from "./types";

/** Add each school's adapter here once it's written from that school's saved pages. */
export const ADAPTERS: SchoolAdapter[] = [demoAdapter];

export function adapterFor(url: URL): SchoolAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(url));
}
