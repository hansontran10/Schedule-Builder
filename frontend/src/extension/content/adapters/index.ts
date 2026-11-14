import { banner9Adapter } from "./banner9";
import { demoAdapter } from "./demo";
import type { SchoolAdapter } from "./types";

/** Add each school's adapter here once it's written from that school's saved pages. */
export const ADAPTERS: SchoolAdapter[] = [
  banner9Adapter({ id: "uncg", name: "UNCG", hosts: ["erp-registration.uncg.edu"] }),
  demoAdapter,
];

export function adapterFor(url: URL): SchoolAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(url));
}
