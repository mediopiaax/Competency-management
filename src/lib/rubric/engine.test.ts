import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { parseWorkbook, type ParsedStudent } from "@/lib/template/parse";
import { readWorkbook } from "@/lib/template/read-workbook";
import { evaluateCompetency, evaluateStudent, round2, type QualMap } from "./engine";
import { fieldIdOf } from "./fields";
import { DEFAULT_LANGUAGE_TABLE } from "./language";
import { DEFAULT_SETTINGS, competencySchema, sourceSchema, type Competency, type Item, type Rubric, type Source } from "./types";
import { hasBlockingIssues, validateRubric } from "./validate";

let students: Record<string, ParsedStudent>;
beforeAll(async () => {
  const sheets = await readWorkbook(readFileSync("docs/reference/학생역량_데이터수집_템플릿_v1 (1).xlsx"));
  students = Object.fromEntries(parseWorkbook(sheets).students.map((s) => [s.sheetName.slice(0, 3), s]));
});

let seq = 0;
const src = (categoryNo: number, label: string, rest: Partial<Source> & Pick<Source, "method">): Source =>
  sourceSchema.parse({ id: `s${++seq}`, fieldId: fieldIdOf(categoryNo, label), ...rest });
const bands = (...pairs: [number, number][]) => pairs.map(([min, score]) => ({ min, score }));
const options = (...pairs: [string, number][]) => pairs.map(([value, score]) => ({ value, score }));
const item = (name: string, weight: number, sources: Source[], rest: Partial<Item> = {}): Item => ({
  id: `i${++seq}`, name, description: "", weight, kind: "basic", combine: "max", sources, ...rest,
});
const competency = (items: Item[]): Competency => competencySchema.parse({ id: `c${++seq}`, name: "테스트 역량", items });
const rubricOf = (...competencies: Competency[]): Rubric => ({
  name: "테스트", generatedBy: "manual", settings: DEFAULT_SETTINGS, languageTable: DEFAULT_LANGUAGE_TABLE, competencies,
});
const run = (c: Competency, student: ParsedStudent, qual: QualMap = {}, rubric = rubricOf(c)) => evaluateCompetency(c, student, rubric, qual);

const attendance = () => src(5, "출석률(%)", { method: "range", bands: bands([95, 100], [90, 85], [80, 70], [0, 20]) });
const gpa = () => src(1, "전체 평점(누적)", { method: "range", bands: bands([4, 100], [3.5, 85], [3, 70], [0, 40]) });
const comment = () => src(34, "코멘트", { method: "narrative", levels: [1, 2, 3, 4, 5].map((level) => ({ level, criterion: `기준 ${level}` })), undecidable: "코멘트 없음" });
const taCount = () => src(10, "과목명", { method: "range", aggregate: "count", bands: bands([1, 80], [0, 0]) });
const engineering = () => src(4, "이수 상태", { method: "choice", options: options(["이수완료", 100], ["이수중", 70], ["미이수", 0], ["포기", 0]) });

describe("데이터 상태별 처리", () => {
  test("미수집 항목은 분자·분모에서 모두 빠지고 0점이 되지 않는다", () => {
    // S02: LMS(5번) 미수집, 성적(1번) 값 있음
    const c = competency([item("출석", 50, [attendance()]), item("성적", 50, [gpa()])]);
    const r = run(c, students.S02);
    const [att, grade] = r.items;
    expect(att).toMatchObject({ status: "excluded", reason: "미수집", score: null, contribution: null });
    expect(r.coverage).toBe(50);
    expect(r.rawScore).toBe(grade.score);
    expect(r.items.filter((i) => i.status === "excluded").every((i) => i.score === null)).toBe(true);
  });

  test("활동 없음은 0점으로 계산에 포함된다", () => {
    // S01: TA(10번) 활동 없음
    const c = competency([item("TA", 50, [taCount()]), item("성적", 50, [gpa()])]);
    const r = run(c, students.S01);
    expect(r.items[0]).toMatchObject({ status: "scored", score: 0 });
    expect(r.coverage).toBe(100);
    expect(r.rawScore).toBe(round2((0 * 50 + 85 * 50) / 100));
  });

  test("해당 없음은 제외되고 충족도에도 불이익이 없다", () => {
    // S02: 공학인증(4번) 해당 없음
    const c = competency([item("공학인증", 40, [engineering()]), item("성적", 60, [gpa()])]);
    const r = run(c, students.S02);
    expect(r.items[0]).toMatchObject({ status: "excluded", reason: "해당 없음" });
    expect(r.coverage).toBe(100);
    expect(r.hold).toBe(false);
    expect(r.missing).toEqual([]);
  });

  test("어떤 샘플에서도 미수집 근거가 점수화되지 않는다", () => {
    const c = competency([
      item("출석", 25, [attendance()]), item("성적", 25, [gpa()]), item("TA", 25, [taCount()]), item("공학인증", 25, [engineering()]),
    ]);
    for (const student of Object.values(students)) {
      for (const it of run(c, student).items) {
        for (const s of it.sources) {
          const fieldCategory = student.categories.find((cat) => s.label.startsWith(cat.label))!;
          if (fieldCategory.status === "미수집") expect(s).toMatchObject({ status: "excluded", score: null });
        }
      }
    }
  });
});

describe("공정성 규칙", () => {
  test("쌓이는 값은 이수 완료 학기 수로 나눈 학기당 값으로 본다", () => {
    const volunteer = (perSemester: boolean) =>
      competency([item("봉사", 100, [src(23, "총 봉사시간(h)", { method: "range", perSemester, bands: bands([30, 100], [5, 80], [0.01, 40], [0, 0]) })])]);
    // S01: 36시간, 7학기 → 학기당 5.14
    expect(run(volunteer(false), students.S01).items[0].score).toBe(100);
    const r = run(volunteer(true), students.S01);
    expect(r.items[0].score).toBe(80);
    expect(r.items[0].sources[0].data).toContain("학기당 5.14");
  });

  test("학기당 0.43회가 0점 구간에 떨어지지 않는다(빈틈 없는 구간표)", () => {
    // S01: 교수 면담 3회 ÷ 7학기 = 0.43
    const c = competency([item("면담", 100, [src(6, "교수 면담 횟수(누적)", { method: "range", perSemester: true, bands: bands([1, 100], [0.5, 80], [0.01, 50], [0, 0]) })])]);
    const r = run(c, students.S01);
    expect(r.items[0].sources[0].data).toContain("0.43");
    expect(r.items[0].score).toBe(50);
  });

  test("구간표 빈틈은 검증에서 오류로 막는다", () => {
    const gap = competency([item("출석", 100, [src(5, "출석률(%)", { method: "range", bands: bands([95, 100], [80, 70]) }), gpa()])]);
    const issues = validateRubric(rubricOf(gap));
    expect(issues.find((i) => i.code === "BAND_GAP")?.message).toContain("0 이상 80 미만");
    expect(hasBlockingIssues(issues)).toBe(true);
    const ok = competency([item("출석", 50, [attendance(), gpa()]), item("성적", 50, [gpa(), attendance()])]);
    expect(validateRubric(rubricOf(ok)).filter((i) => i.code === "BAND_GAP")).toEqual([]);
  });

  test("대체 근거: 하나가 미수집이어도 다른 근거로 평가한다", () => {
    // S03: 어학(26번) 미수집, 외국어 수업(18번) 값 있음
    const language = src(26, "시험명", { method: "language" });
    const course = src(18, "국제어 강의 이수 과목 수", { method: "range", bands: bands([3, 100], [1, 60], [0, 0]) });
    const r = run(competency([item("외국어 능력", 100, [language, course])]), students.S03);
    expect(r.items[0].status).toBe("scored");
    expect(r.items[0].sources[0]).toMatchObject({ status: "excluded", reason: "미수집" });
    expect(r.coverage).toBe(100);
  });

  test("가점형은 있으면 올리고 없어도 끌어내리지 않는다", () => {
    const patent = () => src(16, "진행 상태", { method: "choice", options: options(["등록", 100], ["출원", 80]) });
    const withBonus = competency([item("성적", 100, [gpa()]), item("특허", 10, [patent()], { kind: "bonus" })]);
    const without = competency([item("성적", 100, [gpa()])]);
    // S01: 특허 활동 없음 → 가점 0, 점수 그대로
    expect(run(withBonus, students.S01).rawScore).toBe(run(without, students.S01).rawScore);
    // 작성 예시: 특허 있음 → 가점
    const example = run(withBonus, students["11_"]);
    expect(example.rawScore).toBeGreaterThan(run(without, students["11_"]).rawScore!);
    expect(example.rawScore).toBeLessThanOrEqual(100);
    expect(example.checksumOk).toBe(true);
  });

  test("만료된 어학 성적은 제외한다", () => {
    const expired: ParsedStudent = structuredClone(students.S01);
    expired.categories.find((c) => c.no === 26)!.rows.forEach((r) => (r.expired = true));
    const c = competency([item("어학", 100, [src(26, "시험명", { method: "language" })])]);
    expect(run(c, expired).items[0]).toMatchObject({ status: "excluded", reason: "만료" });
    expect(run(c, students.S01).items[0].score).toBe(70); // TOEIC 780
  });
});

describe("점수·등급", () => {
  test("반올림은 마지막에 한 번만 한다", () => {
    // 63.48 → 63 (63.5 → 64로 두 번 반올림하지 않음)
    const c = competency([
      item("a", 52, [src(5, "출석률(%)", { method: "range", bands: bands([0, 69] ) })]),
      item("b", 48, [src(5, "과제 기한 준수율(%)", { method: "range", bands: bands([0, 57.5]) })]),
    ]);
    const r = run(c, students.S01);
    expect(r.rawScore).toBe(63.48);
    expect(r.score).toBe(63);
    expect(r.grade).toBe("C");
  });

  test("기여 점수를 다시 더하면 역량 점수와 같다", () => {
    const c = competency([item("출석", 30, [attendance()]), item("성적", 30, [gpa()]), item("TA", 40, [taCount()])]);
    for (const student of Object.values(students)) {
      const r = run(c, student);
      const total = round2(r.items.reduce((acc, i) => acc + (i.contribution ?? 0), 0) + r.adjustments.reduce((acc, a) => acc + a.amount, 0));
      if (r.rawScore !== null) expect(total).toBe(r.rawScore);
      expect(r.checksumOk).toBe(true);
    }
  });

  test("충족도가 50% 미만이면 등급 대신 판정 보류", () => {
    // S04: LMS만 있고 면담·TA는 미수집
    const c = competency([item("출석", 30, [attendance()]), item("면담", 40, [src(6, "교수 면담 횟수(누적)", { method: "range", bands: bands([0, 50]) })]), item("TA", 30, [taCount()])]);
    const r = run(c, students.S04);
    expect(r.coverage).toBe(30);
    expect(r).toMatchObject({ hold: true, score: null, grade: null, reliability: null });
    expect(r.missing).toHaveLength(2);
  });

  test("등급 경계", () => {
    const fixed = (score: number) => run(competency([item("a", 100, [src(5, "출석률(%)", { method: "range", bands: bands([0, score]) })])]), students.S01).grade;
    expect([fixed(90), fixed(89.4), fixed(80), fixed(70), fixed(60), fixed(59.4)]).toEqual(["S", "A", "A", "B", "C", "D"]);
  });

  test("서술 판정은 정량 점수 대비 ±15점 안에서만 반영한다", () => {
    const narrative = src(33, "행동(A)", { method: "narrative", levels: [1, 2, 3, 4, 5].map((level) => ({ level, criterion: `기준 ${level}` })) });
    const c = competency([item("성적", 50, [src(5, "출석률(%)", { method: "range", bands: bands([0, 40]) })]), item("성찰", 50, [narrative])]);
    const judged = (level: number | null): QualMap => ({ [narrative.id]: { level, quotes: ["원문"], reason: "", adjacentReason: "", borderline: false, flagged: false } });
    const high = run(c, students.S01, judged(5)); // (40+100)/2 = 70 → 55로 제한
    expect(high.rawScore).toBe(55);
    expect(high.checksumOk).toBe(true);
    const none = run(c, students.S01, judged(null)); // 판단 불가 → 제외, 0점 아님
    expect(none.items[1]).toMatchObject({ status: "excluded", reason: "판단 불가", score: null });
    expect(none.rawScore).toBe(40);
  });

  test("같은 입력·같은 기준이면 항상 같은 결과", () => {
    const c = competency([item("출석", 50, [attendance()]), item("성적", 50, [gpa()])]);
    const rubric = rubricOf(c);
    for (const student of Object.values(students)) {
      expect(evaluateStudent(rubric, student)).toEqual(evaluateStudent(structuredClone(rubric), structuredClone(student)));
    }
  });
});

describe("기준표 검증", () => {
  test("비중 합계, 단일 근거, 중복 가산, 서술 비중, 제외 데이터", () => {
    const dup = gpa();
    const c = competency([
      item("성적", 40, [dup]),
      item("성적2", 30, [{ ...dup, id: "dup2" }, attendance()]),
      item("코멘트", 40, [comment()]),
      item("자기진단", 0, [src(32, "종합 점수", { method: "range", bands: bands([0, 50]) })], { kind: "bonus" }),
    ]);
    const codes = validateRubric(rubricOf(c)).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["WEIGHT_SUM", "SINGLE_SOURCE", "DUPLICATE_EVIDENCE", "QUAL_WEIGHT", "EXCLUDED_FIELD"]));
  });

  test("선택지 점수가 빠진 값이 있으면 오류", () => {
    const c = competency([item("공학인증", 100, [src(4, "이수 상태", { method: "choice", options: options(["이수완료", 100]) }), gpa()])]);
    expect(validateRubric(rubricOf(c)).find((i) => i.code === "CHOICE_GAP")?.message).toContain("이수중");
  });
});
