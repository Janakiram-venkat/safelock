import type { Source } from "./dimensions";

export interface Entry {
  path: string;
  value: number | readonly number[];
  unit: string;
  source: Source;
  note?: string;
}

const isDim = (v: unknown): v is Entry =>
  typeof v === "object" && v !== null && "value" in v && "source" in v && "unit" in v;

/** Flatten every Dim / Dim3 / DimList in a spec-like object. */
export function entries(obj: unknown, prefix = ""): Entry[] {
  if (isDim(obj)) return [{ ...obj, path: prefix }];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

export function placeholders(obj: unknown): Entry[] {
  return entries(obj).filter((e) => e.source === "placeholder");
}

export function formatReport(list: Entry[]): string {
  const fmtVal = (v: Entry["value"]) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));
  const rows = list.map((e) => `  ${e.path.padEnd(38)} ${`${fmtVal(e.value)} ${e.unit}`.padEnd(22)} ${e.note ?? ""}`);
  return rows.join("\n");
}
