import type { Cell, SheetGrid } from "@/lib/template/read-workbook";

export interface CompetencyElement {
  name: string;
  description: string;
  indicators: string;
}
export interface CompetencyInput {
  group: string;
  name: string;
  description: string;
  elements: CompetencyElement[];
}

export const LIST_COLUMNS = ["group", "name", "description", "element", "elementDescription", "indicators"] as const;
export type ListColumn = (typeof LIST_COLUMNS)[number];
export const LIST_COLUMN_LABEL: Record<ListColumn, string> = {
  group: "구분",
  name: "역량명 (필수)",
  description: "역량 설명 (필수)",
  element: "세부 요소",
  elementDescription: "세부 설명",
  indicators: "측정지표",
};
export type ColumnMapping = Partial<Record<ListColumn, number>>;

const PATTERNS: [ListColumn, RegExp][] = [
  ["elementDescription", /세부\s*설명/],
  ["element", /세부\s*요소|하위\s*요소|하위\s*역량/],
  ["indicators", /측정\s*지표|지표|증빙/],
  ["description", /정의|설명|내용/],
  ["name", /역량군|역량명|핵심\s*역량|인재상|역량/],
  ["group", /구분|분류|영역|범주/],
];

const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : String(cell).replace(/\s+/g, " ").trim());

export interface SheetGuess {
  name: string;
  headerRow: number;
  headers: string[];
  mapping: ColumnMapping;
  preview: string[][];
}

export function guessSheet(sheet: SheetGrid): SheetGuess {
  let best = { row: 0, mapping: {} as ColumnMapping };
  sheet.rows.slice(0, 15).forEach((row, r) => {
    const mapping: ColumnMapping = {};
    row.forEach((cell, c) => {
      const header = text(cell);
      if (!header || header.length > 30) return;
      const hit = PATTERNS.find(([column, pattern]) => mapping[column] === undefined && pattern.test(header));
      if (hit) mapping[hit[0]] = c;
    });
    if (Object.keys(mapping).length > Object.keys(best.mapping).length) best = { row: r, mapping };
  });
  const width = Math.max(0, ...sheet.rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, c) => text(sheet.rows[best.row]?.[c]) || `${c + 1}번째 열`);
  const preview = sheet.rows.slice(best.row + 1, best.row + 6).map((row) => Array.from({ length: width }, (_, c) => text(row[c])));
  return { name: sheet.name, headerRow: best.row, headers, mapping: best.mapping, preview };
}

/** 병합 셀(빈칸)은 위 행의 구분·역량명·설명을 이어받는다 */
export function buildCompetencies(sheet: SheetGrid, headerRow: number, mapping: ColumnMapping): CompetencyInput[] {
  if (mapping.name === undefined || mapping.description === undefined) throw new Error("역량명과 역량 설명 열을 지정해야 합니다");
  const at = (row: Cell[], column: ListColumn) => (mapping[column] === undefined ? "" : text(row[mapping[column]!]));
  const result: CompetencyInput[] = [];
  let current: CompetencyInput | null = null;
  let group = "";

  for (const row of sheet.rows.slice(headerRow + 1)) {
    if (row.every((c) => c === null || c === undefined)) continue;
    const name = at(row, "name");
    const rowGroup = at(row, "group");
    if (rowGroup) group = rowGroup;
    if (name && (!current || current.name !== name || current.group !== group)) {
      current = { group, name, description: at(row, "description"), elements: [] };
      result.push(current);
    }
    if (!current) continue;
    if (!current.description) current.description = at(row, "description");
    const element = at(row, "element");
    const indicators = at(row, "indicators");
    if (element || indicators) {
      current.elements.push({ name: element || current.name, description: at(row, "elementDescription"), indicators });
    }
  }
  return result.filter((c) => c.name !== "");
}

/** 직접 입력: 한 줄에 "역량명: 설명" 또는 "구분 | 역량명 | 설명 | 측정지표" */
export function parseManualList(input: string): CompetencyInput[] {
  const result: CompetencyInput[] = [];
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map((p) => p.trim());
      const [group, name, description, indicators] = parts.length >= 3 ? parts : ["", parts[0], parts[1] ?? ""];
      if (!name) continue;
      result.push({ group, name, description: description ?? "", elements: indicators ? [{ name, description: "", indicators }] : [] });
    } else {
      const idx = trimmed.search(/[:：]/);
      const name = idx >= 0 ? trimmed.slice(0, idx).trim() : trimmed;
      const description = idx >= 0 ? trimmed.slice(idx + 1).trim() : "";
      if (name) result.push({ group: "", name, description, elements: [] });
    }
  }
  return result;
}

export function parseCsv(content: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = content.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row.map((c) => (c.trim() === "" ? null : c.trim())));
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row.map((c) => (c.trim() === "" ? null : c.trim()))); }
  return rows;
}
