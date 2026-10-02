import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { fieldDictionary } from "./dictionary";
import { coerce, parseWorkbook, type ParsedStudent, type ParseResult } from "./parse";
import { readWorkbook, type Cell, type SheetGrid } from "./read-workbook";

const TEMPLATE = "docs/reference/학생역량_데이터수집_템플릿_v1 (1).xlsx";

let sheets: SheetGrid[];
let result: ParseResult;
const student = (sheetName: string): ParsedStudent => result.students.find((s) => s.sheetName === sheetName)!;
const cat = (s: ParsedStudent, no: number) => s.categories.find((c) => c.no === no)!;
const codes = (s: ParsedStudent, level?: string) => s.issues.filter((i) => !level || i.level === level).map((i) => i.code);

function cloneSheet(name: string): SheetGrid {
  const src = sheets.find((s) => s.name === name)!;
  return { name: src.name, rows: src.rows.map((r) => [...r]) };
}
function setValue(sheet: SheetGrid, label: string, value: Cell, occurrence = 0) {
  let seen = 0;
  for (const row of sheet.rows) {
    const idx = row.findIndex((c) => c === label);
    if (idx >= 0 && seen++ === occurrence) {
      row[idx + 1] = value;
      return;
    }
  }
  throw new Error(`label not found: ${label}`);
}
function setStatus(sheet: SheetGrid, categoryLabel: string, status: Cell) {
  const row = sheet.rows.find((r) => r.includes(categoryLabel) && r.includes("데이터 상태 ▶"))!;
  row[row.indexOf("데이터 상태 ▶") + 1] = status;
}
const parseOne = (sheet: SheetGrid) => parseWorkbook([sheet]).students[0];

beforeAll(async () => {
  sheets = await readWorkbook(readFileSync(TEMPLATE));
  result = parseWorkbook(sheets);
});

describe("원본 템플릿 워크북", () => {
  test("학생 시트만 골라 읽고 빈 양식은 건너뛴다", () => {
    expect(result.students.map((s) => s.sheetName)).toEqual([
      "11_작성예시", "S01_김민준", "S02_이서연", "S03_박지호", "S04_최유진", "S05_정하늘", "S06_한도윤",
    ]);
    expect(result.skippedSheets).toContainEqual({ name: "10_빈양식", reason: "빈 양식" });
    expect(result.rosterFound).toBe(true);
  });

  test("모든 시트가 템플릿 사전과 일치하고 34개 카테고리를 찾는다", () => {
    for (const s of result.students) {
      expect(s.templateMatched, s.sheetName).toBe(true);
      expect(s.categories).toHaveLength(34);
    }
  });

  test("작성 예시: 전부 값 있음, 경고 없음", () => {
    const s = student("11_작성예시");
    expect(s.isExample).toBe(true);
    expect(s.counts["값 있음"]).toBe(34);
    expect(s.issues).toEqual([]);
  });

  test("S01 충실형: 상태·값을 그대로 읽고 경고가 없다", () => {
    const s = student("S01_김민준");
    expect(s.studentId).toBe("2023310452");
    expect(s.counts).toEqual({ "값 있음": 28, "활동 없음": 5, 미수집: 1, "해당 없음": 0 });
    expect(s.issues).toEqual([]);
    expect(cat(s, 1).fields.find((f) => f.label === "전체 평점(누적)")!.value).toBe(3.68);
    expect(cat(s, 1).rows).toHaveLength(7);
    expect(cat(s, 26).rows[0].cells.map((c) => c.value)).toEqual(["TOEIC", 780, null, "2025-07-27", "2027-07-27"]);
    expect(cat(s, 15).status).toBe("활동 없음");
    expect(cat(s, 34).status).toBe("미수집");
    expect(s.basic.find((f) => f.label === "이수 완료 학기 수")!.value).toBe(7);
  });

  test("S02 일부 누락형: 미수집은 미수집으로, 공학인증은 해당 없음으로 남는다", () => {
    const s = student("S02_이서연");
    expect(s.counts).toEqual({ "값 있음": 17, "활동 없음": 9, 미수집: 7, "해당 없음": 1 });
    expect(cat(s, 4).status).toBe("해당 없음");
    for (const no of [5, 6, 7, 25, 31, 32, 34]) expect(cat(s, no).status).toBe("미수집");
    expect(codes(s, "warn")).toEqual([]);
  });

  test("S03 신입생형: 어학 미수집과 자격증 활동 없음을 구분한다", () => {
    const s = student("S03_박지호");
    expect(s.basic.find((f) => f.label === "이수 완료 학기 수")!.value).toBe(1);
    expect(cat(s, 26).status).toBe("미수집");
    expect(cat(s, 27).status).toBe("활동 없음");
  });

  test("S04 다수 누락형: 상태 미선택은 미수집으로 간주한다", () => {
    const s = student("S04_최유진");
    expect(s.counts["미수집"]).toBe(28);
    expect(cat(s, 2).rawStatus).toBeNull();
    expect(cat(s, 2).status).toBe("미수집");
    expect(cat(s, 2).statusNote).toContain("미선택");
    expect(codes(s, "warn")).toEqual([]);
  });

  test("S05 오류 입력형: 형식 오류와 상태·값 모순을 잡아낸다", () => {
    const s = student("S05_정하늘");
    const gpa = cat(s, 1).fields.find((f) => f.label === "전체 평점(누적)")!;
    expect(gpa).toMatchObject({ raw: "3.7/4.5", value: null, state: "invalid" });
    expect(cat(s, 11)).toMatchObject({ rawStatus: "값 있음", status: "미수집" });
    expect(cat(s, 12)).toMatchObject({ rawStatus: "활동 없음", status: "미수집", hasValues: true });
    expect(cat(s, 17)).toMatchObject({ rawStatus: null, status: "미수집", hasValues: true });
    expect(codes(s).filter((c) => c === "STATUS_CONFLICT")).toHaveLength(3);
    expect(codes(s)).toContain("FIELD_SUSPECT");
    expect(codes(s)).toContain("ROSTER_MISMATCH");
    expect(codes(s).filter((c) => c === "BASIC_INVALID")).toHaveLength(3);
    expect(cat(s, 26).rows[0].cells[0].state).toBe("invalid");
  });

  test("S06 편입형: 학사 명부와 학년 불일치를 경고한다", () => {
    const s = student("S06_한도윤");
    expect(s.issues.find((i) => i.code === "ROSTER_MISMATCH")!.message).toContain("학년(명부 3 / 시트 4)");
    expect(cat(s, 4).status).toBe("해당 없음");
    expect(s.basic.find((f) => f.label === "입학 구분")!.value).toBe("편입학");
  });

  test("같은 입력이면 결과가 항상 같다", () => {
    expect(parseWorkbook(sheets)).toEqual(result);
  });
});

describe("규칙", () => {
  test("숫자 0은 측정된 값이다", () => {
    const def = fieldDictionary.categories[2].fields.find((f) => f.label === "심화과목 이수 과목 수")!;
    expect(coerce(def, 0)).toMatchObject({ value: 0, state: "ok" });
    expect(coerce(def, null)).toMatchObject({ value: null, state: "empty" });
    expect(coerce(def, "3개")).toMatchObject({ value: null, state: "invalid" });
  });

  test("값 있음 카테고리 안의 빈칸은 그 칸만 미수집이다", () => {
    const sheet = cloneSheet("S01_김민준");
    setValue(sheet, "학습계획 달성률(%)", null);
    const s = parseOne(sheet);
    expect(cat(s, 5).status).toBe("값 있음");
    expect(cat(s, 5).fields.find((f) => f.label === "학습계획 달성률(%)")!.state).toBe("empty");
    expect(cat(s, 5).fields.find((f) => f.label === "출석률(%)")!.value).toBe(94);
  });

  test("셀 위치가 밀려도 라벨로 읽는다", () => {
    const src = cloneSheet("S01_김민준");
    const shifted: SheetGrid = {
      name: src.name,
      rows: [[], [], [], ...src.rows.map((r) => [null, null, ...r])],
    };
    shifted.rows.splice(60, 0, []);
    const a = parseOne(src);
    const b = parseOne(shifted);
    expect(b.categories).toEqual(a.categories);
    expect(b.basic).toEqual(a.basic);
  });

  test("개인정보 동의가 N이면 평가에서 제외한다", () => {
    const sheet = cloneSheet("S01_김민준");
    setValue(sheet, "개인정보 수집·이용 동의", "N");
    const s = parseOne(sheet);
    expect(s.evaluable).toBe(false);
    expect(codes(s, "error")).toContain("CONSENT");
  });

  test("공학인증 대상 계열이 N이면 4번은 자동으로 해당 없음", () => {
    const sheet = cloneSheet("S01_김민준");
    setValue(sheet, "공학인증 대상 계열", "N");
    const s = parseOne(sheet);
    expect(cat(s, 4).status).toBe("해당 없음");
    expect(cat(s, 4).statusNote).toContain("자동");
  });

  test("만료된 어학 성적을 표시한다", () => {
    const sheet = cloneSheet("S01_김민준");
    setValue(sheet, "수집 기준일", "2027-08-01");
    const s = parseOne(sheet);
    expect(cat(s, 26).rows[0].expired).toBe(true);
    expect(codes(s, "info")).toContain("SCORE_EXPIRED");
  });

  test("총 봉사시간과 내역 합계가 다르면 경고한다", () => {
    const sheet = cloneSheet("S01_김민준");
    setValue(sheet, "총 봉사시간(h)", 50);
    expect(codes(parseOne(sheet))).toContain("TOTAL_MISMATCH");
  });

  test("허용되지 않는 상태값은 미선택으로 본다", () => {
    const sheet = cloneSheet("S01_김민준");
    setStatus(sheet, "TA 활동", "없음");
    const s = parseOne(sheet);
    expect(cat(s, 10).status).toBe("미수집");
    expect(codes(s)).toContain("STATUS_UNKNOWN");
  });

  test("카테고리가 빠진 파일은 템플릿 불일치로 표시한다", () => {
    const sheet = cloneSheet("S01_김민준");
    const start = sheet.rows.findIndex((r) => r.includes("TA 활동"));
    sheet.rows.splice(start, 7);
    const s = parseOne(sheet);
    expect(s.templateMatched).toBe(false);
    expect(codes(s, "error")).toEqual(expect.arrayContaining(["CATEGORY_MISSING", "TEMPLATE_MISMATCH"]));
  });
});
