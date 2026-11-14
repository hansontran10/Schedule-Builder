import type { CrnForm } from "./adapters/types";

export interface FillResult {
  filled: string[];
  /** CRNs there was no box for (the page had too few and no way to add more). */
  notFilled: string[];
}

/**
 * Type each CRN into the school's form the way a person would, so the page's own scripts
 * notice. Never clicks submit: the student reviews and submits themselves.
 */
export function fillCrns(form: CrnForm, crns: string[]): FillResult {
  const filled: string[] = [];
  const queue = [...new Set(crns)];
  for (let guard = 0; queue.length > 0 && guard < 50; guard++) {
    const empty = form.inputs().find((i) => !i.value.trim() && !i.disabled);
    if (!empty) {
      if (!form.addRow?.()) break;
      continue;
    }
    setInputValue(empty, queue.shift()!);
    filled.push(empty.value);
  }
  return { filled, notFilled: queue };
}

/**
 * Frameworks like the one Banner uses track input values themselves, so assigning `.value`
 * alone can be ignored. Use the native setter, then fire the events a keyboard would.
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
