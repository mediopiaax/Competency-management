import {
  DATA_STATUSES,
  fieldDictionary,
  type CategoryDef,
  type DataStatus,
  type FieldDef,
  type FieldDictionary,
} from "./dictionary";
import type { Cell, SheetGrid } from "./read-workbook";

export type IssueLevel = "error" | "warn" | "info";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  categoryNo?: number;
  field?: string;
}

export interface FieldValue {
  id: string;
  label: string;
  type: FieldDef["type"];
  raw: Cell;
  value: string | number | null;
  /** empty = 칸 단위 미수집, invalid = 형식 오류로 계산에 쓸 수 없음 */
  state: "ok" | "empty" | "invalid";
  note?: string;
}

export interface ParsedRow {
  cells: FieldValue[];
  expired?: boolean;
}

export interface ParsedCategory {
  no: number;
  id: string;
  label: string;
  group: string;
  rawStatus: string | null;
  status: DataStatus;
  statusNote: string | null;
  hasValues: boolean;
  fields: FieldValue[];
  rows: ParsedRow[];
  excludedFromScoring: boolean;
}

export interface ParsedStudent {
  sheetName: string;
  isExample: boolean;
  studentId: string | null;
  name: string | null;
  basic: FieldValue[];
  categories: ParsedCategory[];
  issues: Issue[];
  evaluable: boolean;
  excludedReason: string | null;
  counts: Record<DataStatus, number>;
  completionRate: number;
  templateVersion: string;
  templateMatched: boolean;
}

export interface ParseResult {
  students: ParsedStudent[];
  skippedSheets: { name: string; reason: string }[];
  rosterFound: boolean;
}

const STATUS_MARKER = "데이터 상태";

function text(cell: Cell): string | null {
  if (cell === null) return null;
  return String(cell).replace(/\s+/g, " ").trim();
}

function isIsoDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function coerce(def: FieldDef, raw: Cell): FieldValue {
  const base = { id: def.id, label: def.label, type: def.type, raw };
  if (raw === null) return { ...base, value: null, state: "empty" };
  const s = String(raw).trim();
  const invalid = (note: string): FieldValue => ({ ...base, value: null, state: "invalid", note });
  const format = def.format ?? "";

  if (def.type === "number" && format.includes("(텍스트)")) {
    return /^\d+$/.test(s) ? { ...base, value: s, state: "ok" } : invalid("숫자로만 된 값이어야 합니다");
  }

  switch (def.type) {
    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(s)) return invalid("단위·기호 없이 숫자만 입력해야 합니다");
      const n = Number(s);
      const range = format.match(/(\d+)\s*~\s*(\d+)/);
      if (range && (n < Number(range[1]) || n > Number(range[2]))) {
        return invalid(`${range[1]}~${range[2]} 범위를 벗어났습니다`);
      }
      if (range && range[2] === "100" && n > 0 && n < 1) {
        return { ...base, value: n, state: "ok", note: "0~1 사이 비율로 입력한 것으로 보입니다(0~100 기준)" };
      }
      return { ...base, value: n, state: "ok" };
    }
    case "enum":
      return def.options?.includes(s) ? { ...base, value: s, state: "ok" } : invalid("목록에 없는 값입니다");
    case "date":
      return isIsoDate(s) ? { ...base, value: s, state: "ok" } : invalid("YYYY-MM-DD 형식이어야 합니다");
    case "yearMonth":
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { ...base, value: s, state: "ok" };
      if (format.includes("진행중") && s === "진행중") return { ...base, value: s, state: "ok" };
      return invalid("YYYY-MM 형식이어야 합니다");
    case "semester":
      return /^\d{4}-(1|2|여름|겨울)$/.test(s)
        ? { ...base, value: s, state: "ok" }
        : invalid("YYYY-1 / YYYY-2 / YYYY-여름 / YYYY-겨울 형식이어야 합니다");
    case "year":
      return /^\d{4}$/.test(s) ? { ...base, value: s, state: "ok" } : invalid("YYYY 형식이어야 합니다");
    default:
      return { ...base, value: s, state: "ok" };
  }
}

interface RosterEntry {
  kind: string | null;
  studentId: string | null;
  name: string | null;
  grade: string | null;
}

function readRoster(sheets: SheetGrid[]): Map<string, RosterEntry> | null {
  for (const sheet of sheets) {
    const headerIdx = sheet.rows.findIndex((row) => {
      const t = row.map(text);
      return t.includes("시트명") && t.includes("학번");
    });
    if (headerIdx < 0) continue;
    const header = sheet.rows[headerIdx].map(text);
    const col = (label: string) => header.indexOf(label);
    const roster = new Map<string, RosterEntry>();
    for (const row of sheet.rows.slice(headerIdx + 1)) {
      const sheetName = text(row[col("시트명")] ?? null);
      if (!sheetName) continue;
      roster.set(sheetName, {
        kind: col("구분") >= 0 ? text(row[col("구분")]) : null,
        studentId: text(row[col("학번")] ?? null),
        name: col("이름") >= 0 ? text(row[col("이름")]) : null,
        grade: col("학년") >= 0 ? text(row[col("학년")]) : null,
      });
    }
    return roster;
  }
  return null;
}

function isStudentSheet(sheet: SheetGrid) {
  return sheet.rows.some((row) => {
    const first = row.map(text).find((c) => c !== null);
    return first !== undefined && first!.startsWith("■") && first!.includes("학생 기본정보");
  });
}

interface Scan {
  basic: Map<string, Cell>;
  cats: Map<number, { rawStatus: string | null; fields: Map<string, Cell>; rows: Map<string, Cell>[] }>;
  unknownLabels: string[];
}

function scanSheet(sheet: SheetGrid, dict: FieldDictionary): Scan {
  const basicLabels = new Set(dict.basicInfo.map((f) => f.label));
  const catByLabel = new Map(dict.categories.map((c) => [c.label, c]));
  const scan: Scan = { basic: new Map(), cats: new Map(), unknownLabels: [] };

  let mode: "none" | "basic" | "category" = "none";
  let cat: CategoryDef | null = null;
  let tableCols: Map<number, string> | null = null;

  for (const row of sheet.rows) {
    const cells = row.map(text);
    const firstIdx = cells.findIndex((c) => c !== null);
    if (firstIdx < 0) {
      tableCols = null;
      continue;
    }
    const first = cells[firstIdx]!;

    if (first.startsWith("■")) {
      mode = first.includes("학생 기본정보") ? "basic" : "category";
      cat = null;
      tableCols = null;
      continue;
    }

    const markerIdx = cells.findIndex((c) => c !== null && c.startsWith(STATUS_MARKER));
    if (mode === "category" && markerIdx >= 0) {
      tableCols = null;
      const label = cells.slice(0, markerIdx).find((c) => c !== null && catByLabel.has(c));
      cat = label ? catByLabel.get(label)! : null;
      if (cat) {
        scan.cats.set(cat.no, { rawStatus: cells[markerIdx + 1] ?? null, fields: new Map(), rows: [] });
      } else {
        scan.unknownLabels.push(cells.slice(0, markerIdx).filter((c) => c !== null && Number.isNaN(Number(c))).join(" "));
      }
      continue;
    }

    if (mode === "basic") {
      const idx = cells.findIndex((c) => c !== null && basicLabels.has(c));
      if (idx >= 0) scan.basic.set(cells[idx]!, row[idx + 1] ?? null);
      continue;
    }

    if (mode !== "category" || !cat) continue;
    const entry = scan.cats.get(cat.no)!;

    if (first === "No" && cat.table) {
      const byLabel = new Map(cat.table.columns.map((c) => [c.label, c.id]));
      tableCols = new Map();
      cells.forEach((c, j) => {
        if (j <= firstIdx || c === null) return;
        const id = byLabel.get(c);
        if (id) tableCols!.set(j, id);
        else scan.unknownLabels.push(`${cat!.label} > ${c}`);
      });
      continue;
    }
    if (first === "형식") continue;

    if (tableCols) {
      const values = new Map<string, Cell>();
      let any = false;
      for (const [j, id] of tableCols) {
        const v = row[j] ?? null;
        values.set(id, v);
        if (v !== null) any = true;
      }
      if (any) entry.rows.push(values);
      continue;
    }

    const fieldLabels = new Set(cat.fields.map((f) => f.label));
    const idx = cells.findIndex((c) => c !== null && fieldLabels.has(c));
    if (idx >= 0) entry.fields.set(cells[idx]!, row[idx + 1] ?? null);
  }
  return scan;
}

function parseStudentSheet(
  sheet: SheetGrid,
  dict: FieldDictionary,
  roster: Map<string, RosterEntry> | null,
): ParsedStudent | null {
  const scan = scanSheet(sheet, dict);
  const issues: Issue[] = [];
  let missingLabels = 0;

  const basic = dict.basicInfo.map((def) => {
    if (!scan.basic.has(def.label)) missingLabels++;
    return coerce(def, scan.basic.get(def.label) ?? null);
  });
  const basicOf = (label: string) => basic.find((f) => f.label === label)!;

  const anyInput =
    basic.some((f) => f.raw !== null) ||
    [...scan.cats.values()].some((c) => c.rawStatus !== null || c.rows.length > 0 || [...c.fields.values()].some((v) => v !== null));
  if (!anyInput) return null;

  for (const f of basic) {
    if (f.state === "invalid") {
      issues.push({ level: "warn", code: "BASIC_INVALID", field: f.label, message: `기본정보 '${f.label}' 값 "${f.raw}" — ${f.note}` });
    }
  }
  for (const label of ["학번", "이름", "이수 완료 학기 수"]) {
    if (basicOf(label).state === "empty") {
      issues.push({ level: "warn", code: "BASIC_MISSING", field: label, message: `기본정보 '${label}'이(가) 비어 있습니다` });
    }
  }

  const engineering = basicOf("공학인증 대상 계열").value;
  const collectedOn = basicOf("수집 기준일").value as string | null;

  const categories: ParsedCategory[] = dict.categories.map((def) => {
    const found = scan.cats.get(def.no);
    if (!found) {
      missingLabels++;
      issues.push({ level: "error", code: "CATEGORY_MISSING", categoryNo: def.no, message: `${def.no}번 '${def.label}' 카테고리를 파일에서 찾지 못했습니다` });
    }
    const fields = def.fields.map((f) => {
      if (found && !found.fields.has(f.label)) missingLabels++;
      return coerce(f, found?.fields.get(f.label) ?? null);
    });
    const rows: ParsedRow[] = (found?.rows ?? []).map((values) => ({
      cells: def.table!.columns.map((c) => coerce(c, values.get(c.id) ?? null)),
    }));
    const hasValues = fields.some((f) => f.raw !== null) || rows.length > 0;

    let rawStatus = found?.rawStatus ?? null;
    if (rawStatus !== null && !(DATA_STATUSES as readonly string[]).includes(rawStatus)) {
      issues.push({ level: "warn", code: "STATUS_UNKNOWN", categoryNo: def.no, message: `${def.no}번 '${def.label}' 데이터 상태 "${rawStatus}"은(는) 허용되지 않는 값이라 미선택으로 봅니다` });
      rawStatus = null;
    }

    let status: DataStatus;
    let statusNote: string | null = null;
    const conflict = (message: string) => {
      status = "미수집";
      statusNote = message;
      issues.push({ level: "warn", code: "STATUS_CONFLICT", categoryNo: def.no, message: `${def.no}번 '${def.label}': ${message} → 미수집으로 처리` });
    };

    if (rawStatus === null) {
      status = "미수집";
      if (hasValues) conflict("상태를 고르지 않았는데 입력값이 있습니다");
      else statusNote = "상태 미선택 → 미수집 간주";
    } else if (rawStatus === "값 있음") {
      status = "값 있음";
      if (!hasValues) conflict("상태는 '값 있음'인데 입력값이 없습니다");
    } else {
      status = rawStatus as DataStatus;
      if (hasValues) conflict(`상태는 '${rawStatus}'인데 입력값이 있습니다`);
    }

    if (def.label === "공학인증") {
      const target = fields.find((f) => f.label === "공학인증 대상 여부")?.value;
      if (engineering === "N") {
        if (rawStatus !== "해당 없음") statusNote = "기본정보의 공학인증 대상 계열이 N이라 자동으로 해당 없음 처리";
        else statusNote = null;
        status = "해당 없음";
      } else if (engineering === "Y" && rawStatus === "해당 없음") {
        issues.push({ level: "info", code: "ENGINEERING_NA_CHECK", categoryNo: def.no, message: "기본정보는 공학인증 대상 계열(Y)인데 4번은 '해당 없음'입니다. 편입 등 비대상 사유를 확인하세요" });
      } else if (engineering === "Y" && target === "비대상") {
        issues.push({ level: "warn", code: "ENGINEERING_MISMATCH", categoryNo: def.no, message: "기본정보는 공학인증 대상 계열(Y)인데 4번의 대상 여부는 '비대상'입니다" });
      }
    }

    if (status! === "값 있음") {
      const report = (f: FieldValue, where: string) => {
        if (f.state === "invalid") {
          issues.push({ level: "warn", code: "FIELD_INVALID", categoryNo: def.no, field: f.label, message: `${def.no}번 '${def.label}' ${where}'${f.label}' 값 "${f.raw}" — ${f.note}. 이 칸은 미수집으로 처리` });
        } else if (f.note) {
          issues.push({ level: "warn", code: "FIELD_SUSPECT", categoryNo: def.no, field: f.label, message: `${def.no}번 '${def.label}' ${where}'${f.label}' 값 "${f.raw}" — ${f.note}` });
        }
      };
      fields.forEach((f) => report(f, ""));
      rows.forEach((r, i) => r.cells.forEach((c) => report(c, `${i + 1}행 `)));

      const expiryIdx = def.table?.columns.findIndex((c) => c.label === "만료일") ?? -1;
      if (expiryIdx >= 0 && collectedOn) {
        rows.forEach((r, i) => {
          const expiry = r.cells[expiryIdx];
          if (expiry.state === "ok" && (expiry.value as string) < collectedOn) {
            r.expired = true;
            issues.push({ level: "info", code: "SCORE_EXPIRED", categoryNo: def.no, message: `${def.no}번 '${def.label}' ${i + 1}행: 만료일 ${expiry.value}이 수집 기준일 ${collectedOn}보다 이릅니다(만료)` });
          }
        });
      }

      const total = fields.find((f) => f.label === "총 봉사시간(h)");
      const hoursIdx = def.table?.columns.findIndex((c) => c.label === "시간(h)") ?? -1;
      if (total?.state === "ok" && hoursIdx >= 0 && rows.length > 0) {
        const hours = rows.map((r) => r.cells[hoursIdx]);
        if (hours.every((h) => h.state === "ok")) {
          const sum = hours.reduce((acc, h) => acc + (h.value as number), 0);
          if (Math.abs(sum - (total.value as number)) > 0.005) {
            issues.push({ level: "warn", code: "TOTAL_MISMATCH", categoryNo: def.no, message: `${def.no}번 '${def.label}': 총 봉사시간 ${total.value}h와 내역 합계 ${sum}h가 다릅니다` });
          }
        }
      }
    }

    return {
      no: def.no,
      id: def.id,
      label: def.label,
      group: def.group,
      rawStatus: found?.rawStatus ?? null,
      status: status!,
      statusNote,
      hasValues,
      fields,
      rows,
      excludedFromScoring: def.excludedFromScoring === true,
    };
  });

  for (const label of scan.unknownLabels) {
    issues.push({ level: "warn", code: "UNKNOWN_LABEL", message: `템플릿 사전에 없는 항목 '${label}'은(는) 읽지 않았습니다` });
  }
  const templateMatched = missingLabels === 0 && scan.unknownLabels.length === 0;
  if (!templateMatched) {
    issues.push({ level: "error", code: "TEMPLATE_MISMATCH", message: `템플릿 ${dict.templateVersion}과 항목 구성이 다릅니다(누락 ${missingLabels}개, 미등록 ${scan.unknownLabels.length}개)` });
  }

  const studentId = basicOf("학번").raw === null ? null : String(basicOf("학번").raw);
  const name = (basicOf("이름").value as string | null) ?? null;

  const entry = roster?.get(sheet.name);
  const isExample = entry?.kind === "예시" || sheet.name.includes("작성예시");

  if (name && !isExample && !sheet.name.includes(name)) {
    issues.push({ level: "warn", code: "SHEET_NAME_MISMATCH", message: `시트 이름 '${sheet.name}'에 학생 이름 '${name}'이(가) 없습니다` });
  }

  if (entry) {
    const gradeRaw = basicOf("학년").raw;
    const diffs: string[] = [];
    if (entry.studentId !== null && entry.studentId !== (studentId ?? "")) diffs.push(`학번(명부 ${entry.studentId} / 시트 ${studentId ?? "빈칸"})`);
    if (entry.name !== null && entry.name !== (name ?? "")) diffs.push(`이름(명부 ${entry.name} / 시트 ${name ?? "빈칸"})`);
    if (entry.grade !== null && Number(entry.grade) !== Number(gradeRaw)) diffs.push(`학년(명부 ${Number(entry.grade)} / 시트 ${gradeRaw ?? "빈칸"})`);
    if (diffs.length > 0) {
      issues.push({ level: "warn", code: "ROSTER_MISMATCH", message: `학사 명부와 기본정보가 다릅니다: ${diffs.join(", ")}` });
    }
  }

  const consent = basicOf("개인정보 수집·이용 동의").value;
  let excludedReason: string | null = null;
  if (consent === "N") excludedReason = "개인정보 수집·이용에 동의하지 않아 평가에서 제외합니다";
  else if (consent !== "Y") excludedReason = "개인정보 수집·이용 동의가 확인되지 않아 평가에서 제외합니다";
  if (excludedReason) issues.push({ level: "error", code: "CONSENT", message: excludedReason });

  const counts = { "값 있음": 0, "활동 없음": 0, 미수집: 0, "해당 없음": 0 } as Record<DataStatus, number>;
  for (const c of categories) counts[c.status]++;

  return {
    sheetName: sheet.name,
    isExample,
    studentId,
    name,
    basic,
    categories,
    issues,
    evaluable: excludedReason === null,
    excludedReason,
    counts,
    completionRate: (categories.length - counts["미수집"]) / categories.length,
    templateVersion: dict.templateVersion,
    templateMatched,
  };
}

export function parseWorkbook(sheets: SheetGrid[], dict: FieldDictionary = fieldDictionary): ParseResult {
  const roster = readRoster(sheets);
  const result: ParseResult = { students: [], skippedSheets: [], rosterFound: roster !== null };
  for (const sheet of sheets) {
    if (!isStudentSheet(sheet)) {
      result.skippedSheets.push({ name: sheet.name, reason: "학생 데이터 양식이 아님" });
      continue;
    }
    const student = parseStudentSheet(sheet, dict, roster);
    if (student) result.students.push(student);
    else result.skippedSheets.push({ name: sheet.name, reason: "빈 양식" });
  }
  return result;
}
