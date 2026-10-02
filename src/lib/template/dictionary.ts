import raw from "./field-dictionary.json";

export type ValueType =
  | "number"
  | "text"
  | "narrative"
  | "enum"
  | "date"
  | "yearMonth"
  | "semester"
  | "year";

export interface FieldDef {
  id: string;
  label: string;
  type: ValueType;
  format: string | null;
  guide?: string | null;
  options?: string[];
}

export interface CategoryDef {
  no: number;
  id: string;
  group: string;
  label: string;
  fields: FieldDef[];
  table: { columns: FieldDef[]; templateRows: number } | null;
  meta?: Record<string, string>;
  excludedFromScoring?: boolean;
}

export interface FieldDictionary {
  templateVersion: string;
  statusValues: string[];
  basicInfo: FieldDef[];
  categories: CategoryDef[];
}

export const fieldDictionary = raw as unknown as FieldDictionary;

export const DATA_STATUSES = ["값 있음", "활동 없음", "미수집", "해당 없음"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];
