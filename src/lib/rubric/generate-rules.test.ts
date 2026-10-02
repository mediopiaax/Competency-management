import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { buildCompetencies, guessSheet, parseManualList, type CompetencyInput } from "@/lib/competency/parse-list";
import { parseWorkbook } from "@/lib/template/parse";
import { readWorkbook, type SheetGrid } from "@/lib/template/read-workbook";
import { evaluateStudent } from "./engine";
import { generateRubricByRules } from "./generate-rules";
import { rubricSchema } from "./types";
import { validateRubric } from "./validate";

let listSheets: SheetGrid[];
let list: CompetencyInput[];
beforeAll(async () => {
  listSheets = await readWorkbook(readFileSync("docs/reference/역량목록_설명추가 (1).xlsx"));
  const guess = guessSheet(listSheets[0]);
  list = buildCompetencies(listSheets[0], guess.headerRow, guess.mapping);
});

test("역량 목록: 머리줄과 열을 추정하고 병합 셀을 이어받는다", () => {
  const guess = guessSheet(listSheets[0]);
  expect(guess.headerRow).toBe(2);
  expect(guess.mapping).toEqual({ group: 0, name: 1, description: 2, element: 3, elementDescription: 4, indicators: 5 });
  expect(list).toHaveLength(19);
  expect(list.reduce((acc, c) => acc + c.elements.length, 0)).toBe(42);
  expect(list.filter((c) => c.name === "글로벌").map((c) => c.group)).toEqual(["자기개발역량", "기업 관심 역량"]);
  expect(list.every((c) => c.description !== "")).toBe(true);
});

test("직접 입력", () => {
  expect(parseManualList("창의: 새로운 생각\n\n기업 | 협업 | 함께 일함 | 팀 프로젝트")).toEqual([
    { group: "", name: "창의", description: "새로운 생각", elements: [] },
    { group: "기업", name: "협업", description: "함께 일함", elements: [{ name: "협업", description: "", indicators: "팀 프로젝트" }] },
  ]);
});

test("기본 초안: 스키마를 통과하고 저장을 막는 오류가 없다", () => {
  const rubric = generateRubricByRules("샘플", list);
  expect(rubricSchema.safeParse(rubric).success).toBe(true);
  const issues = validateRubric(rubric);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  expect(rubric.competencies).toHaveLength(19);
  expect(rubric.competencies.map((c) => c.name)).toEqual(list.map((c) => c.name));
  expect(rubric.competencies.filter((c) => c.items.length === 0).map((c) => c.name)).toEqual([]);
});

test("기본 초안으로 샘플 학생 전원을 채점할 수 있다", async () => {
  const rubric = generateRubricByRules("샘플", list);
  const sheets = await readWorkbook(readFileSync("docs/reference/학생역량_데이터수집_템플릿_v1 (1).xlsx"));
  const students = parseWorkbook(sheets).students;
  const summary = students.map((s) => {
    const result = evaluateStudent(rubric, s);
    expect(result.competencies.every((c) => c.checksumOk)).toBe(true);
    return { name: s.name, hold: result.competencies.filter((c) => c.hold).length, scores: result.competencies.map((c) => c.score ?? "-").join(" ") };
  });
  console.table(summary);
  const byName = Object.fromEntries(summary.map((s) => [s.name, s]));
  expect(byName["김민준"].hold).toBeLessThan(3);
  expect(byName["최유진"].hold).toBeGreaterThan(12);
});
