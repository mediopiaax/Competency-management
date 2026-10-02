import type { FieldValue, ParsedCategory, ParsedRow, ParsedStudent } from "@/lib/template/parse";
import { fieldLabel, findField } from "./fields";
import type { Band, Competency, Item, Rubric, Source } from "./types";

export type ExcludeReason = "미수집" | "해당 없음" | "판단 불가" | "만료" | "기준 없음";

export interface QualJudgment {
  level: number | null;
  quotes: string[];
  reason: string;
  adjacentReason: string;
  borderline: boolean;
  flagged: boolean;
}
/** 근거(source) id → 서술 판정 */
export type QualMap = Record<string, QualJudgment>;

export interface SourceResult {
  sourceId: string;
  label: string;
  method: Source["method"];
  status: "scored" | "excluded";
  reason: ExcludeReason | null;
  score: number | null;
  data: string;
  rule: string;
}

export interface ItemResult {
  itemId: string;
  name: string;
  kind: Item["kind"];
  weight: number;
  qualitative: boolean;
  status: "scored" | "excluded";
  reason: ExcludeReason | null;
  score: number | null;
  contribution: number | null;
  sources: SourceResult[];
}

export interface CompetencyResult {
  competencyId: string;
  group: string;
  name: string;
  hold: boolean;
  score: number | null;
  rawScore: number | null;
  grade: string | null;
  coverage: number;
  reliability: "상" | "중" | "하" | null;
  adjustments: { label: string; amount: number }[];
  formula: string;
  checksumOk: boolean;
  items: ItemResult[];
  missing: string[];
}

export interface StudentEvaluation {
  competencies: CompetencyResult[];
}

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

const fmt = (n: number) => String(round2(n));

function sortedBands(bands: Band[]) {
  return [...bands].sort((a, b) => b.min - a.min);
}

export function bandText(bands: Band[], index: number, unit = ""): string {
  const band = bands[index];
  const upper = index > 0 ? ` ${fmt(bands[index - 1].min)}${unit} 미만` : "";
  return `${fmt(band.min)}${unit} 이상${upper} → ${fmt(band.score)}점`;
}

function lookupBand(bands: Band[], value: number): { score: number; rule: string } | null {
  const sorted = sortedBands(bands);
  const index = sorted.findIndex((b) => value >= b.min);
  if (index < 0) return null;
  return { score: sorted[index].score, rule: bandText(sorted, index) };
}

type Outcome = Pick<SourceResult, "status" | "reason" | "score" | "data" | "rule">;
const excluded = (reason: ExcludeReason, data: string, rule = ""): Outcome => ({ status: "excluded", reason, score: null, data, rule });
const scored = (score: number, data: string, rule: string): Outcome => ({ status: "scored", reason: null, score: round2(score), data, rule });

function semestersOf(student: ParsedStudent): number | null {
  const value = student.basic.find((f) => f.label === "이수 완료 학기 수")?.value;
  return typeof value === "number" && value > 0 ? value : null;
}

function cellOf(row: ParsedRow, fieldId: string): FieldValue | undefined {
  return row.cells.find((c) => c.id === fieldId);
}

function scoreRange(source: Source, value: number, dataPrefix: string, student: ParsedStudent): Outcome {
  let v = value;
  let data = dataPrefix;
  if (source.perSemester) {
    const semesters = semestersOf(student);
    if (semesters === null) return excluded("미수집", `${dataPrefix} (이수 완료 학기 수가 없어 학기당 환산 불가)`);
    v = round2(value / semesters);
    data = `${dataPrefix} ÷ ${semesters}학기 = 학기당 ${fmt(v)}`;
  }
  const hit = lookupBand(source.bands, v);
  if (!hit) return excluded("기준 없음", data, "구간표에 이 값이 들어갈 구간이 없습니다");
  return scored(hit.score, data, hit.rule);
}

function scoreLanguage(source: Source, category: ParsedCategory, rubric: Rubric): Outcome {
  if (category.rows.length === 0) return excluded("미수집", "입력된 어학 성적 없음");
  const rows = rubric.settings.excludeExpired ? category.rows.filter((r) => !r.expired) : category.rows;
  if (rows.length === 0) return excluded("만료", "어학 성적이 모두 만료됨", "만료 성적 제외 설정");

  const byLabel = (row: ParsedRow, label: string) => row.cells.find((c) => c.label === label);
  let best: { score: number; data: string; rule: string } | null = null;
  for (const row of rows) {
    const exam = byLabel(row, "시험명");
    if (exam?.state !== "ok") continue;
    const entry = rubric.languageTable.find((e) => e.exam === exam.value);
    if (!entry) continue;
    let hit: { score: number; data: string; rule: string } | null = null;
    if (entry.basis === "score") {
      const score = byLabel(row, "점수");
      if (score?.state !== "ok") continue;
      const band = lookupBand(entry.bands, score.value as number);
      if (band) hit = { score: band.score, data: `${entry.exam} ${score.value}`, rule: `${entry.exam} ${band.rule}` };
    } else {
      const grade = byLabel(row, "등급·레벨");
      if (grade?.state !== "ok") continue;
      const option = entry.options.find((o) => o.value === grade.value);
      if (option) hit = { score: option.score, data: `${entry.exam} ${grade.value}`, rule: `${entry.exam} ${option.value} → ${fmt(option.score)}점` };
    }
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  if (!best) return excluded("미수집", "환산표로 바꿀 수 있는 어학 성적 없음");
  return scored(best.score, best.data, `${best.rule} (여러 건이면 최고값)`);
}

function scoreSource(source: Source, student: ParsedStudent, rubric: Rubric, qual: QualMap): Outcome {
  const ref = findField(source.fieldId);
  if (!ref) return excluded("기준 없음", "템플릿에 없는 데이터");
  const category = student.categories.find((c) => c.id === ref.category.id);
  if (!category || category.status === "미수집") return excluded("미수집", "데이터 미수집");
  if (category.status === "해당 없음") return excluded("해당 없음", "이 학생에게 해당하지 않는 항목");
  if (category.status === "활동 없음") return scored(0, "활동 없음으로 확인됨", "활동 없음 → 0점");

  if (source.method === "narrative") {
    const judgment = qual[source.id];
    if (!judgment) return excluded("판단 불가", "서술 판정이 실행되지 않음");
    if (judgment.level === null) return excluded("판단 불가", judgment.reason || "판단할 근거 부족");
    const criterion = source.levels.find((l) => l.level === judgment.level)?.criterion ?? "";
    return scored(judgment.level * 20, judgment.quotes.map((q) => `“${q}”`).join(" "), `레벨 ${judgment.level}: ${criterion} → ${judgment.level * 20}점`);
  }
  if (source.method === "language") return scoreLanguage(source, category, rubric);

  if (!ref.inTable) {
    const field = category.fields.find((f) => f.id === source.fieldId);
    if (!field || field.state !== "ok") return excluded("미수집", field?.state === "invalid" ? `형식 오류: "${field.raw}"` : "빈칸");
    if (source.method === "range") {
      if (typeof field.value !== "number") return excluded("기준 없음", `${field.value}`, "숫자가 아닌 데이터에는 숫자 구간을 쓸 수 없습니다");
      return scoreRange(source, field.value, fmt(field.value), student);
    }
    const option = source.options.find((o) => o.value === String(field.value));
    if (!option) return excluded("기준 없음", String(field.value), "이 값에 대한 점수가 없습니다");
    return scored(option.score, String(field.value), `${option.value} → ${fmt(option.score)}점`);
  }

  if (category.rows.length === 0) return excluded("미수집", "입력된 내역 없음");
  let rows = category.rows;
  if (rubric.settings.excludeExpired) {
    rows = rows.filter((r) => !r.expired);
    if (rows.length === 0) return excluded("만료", "모든 내역이 만료됨", "만료 내역 제외 설정");
  }
  let filterText = "";
  if (source.filter) {
    const { fieldId, values } = source.filter;
    rows = rows.filter((r) => {
      const cell = cellOf(r, fieldId);
      return cell?.state === "ok" && values.includes(String(cell.value));
    });
    filterText = `${findField(fieldId)?.field.label ?? ""} = ${values.join("/")} `;
    if (rows.length === 0) return scored(0, `${filterText}에 해당하는 내역 없음`, "해당 내역 없음 → 0점");
  }

  if (source.method === "range") {
    if (source.aggregate === "count") return scoreRange(source, rows.length, `${filterText}${rows.length}건`, student);
    const numbers = rows.map((r) => cellOf(r, source.fieldId)).filter((c) => c?.state === "ok" && typeof c.value === "number").map((c) => c!.value as number);
    if (numbers.length === 0) return excluded("미수집", "숫자 값이 입력된 내역 없음");
    const list = numbers.map(fmt).join(", ");
    if (source.aggregate === "sum") return scoreRange(source, round2(numbers.reduce((a, b) => a + b, 0)), `${filterText}합계 ${fmt(numbers.reduce((a, b) => a + b, 0))} (${list})`, student);
    if (source.aggregate === "avg") {
      const avg = round2(numbers.reduce((a, b) => a + b, 0) / numbers.length);
      return scoreRange(source, avg, `${filterText}평균 ${fmt(avg)} (${list})`, student);
    }
    return scoreRange(source, Math.max(...numbers), `${filterText}최고 ${fmt(Math.max(...numbers))} (${list})`, student);
  }

  const rowScores: { score: number; text: string }[] = [];
  for (const row of rows) {
    const cell = cellOf(row, source.fieldId);
    if (cell?.state !== "ok") continue;
    const option = source.options.find((o) => o.value === String(cell.value));
    if (!option) continue;
    let factor = 1;
    let factorText = "";
    if (source.multiplier) {
      const m = cellOf(row, source.multiplier.fieldId);
      const found = m?.state === "ok" ? source.multiplier.factors.find((f) => f.value === String(m.value)) : undefined;
      if (found) {
        factor = found.factor;
        factorText = ` × ${found.value} ${fmt(found.factor)}`;
      }
    }
    rowScores.push({ score: round2(option.score * factor), text: `${option.value} ${fmt(option.score)}점${factorText}` });
  }
  if (rowScores.length === 0) {
    const hasValue = rows.some((r) => cellOf(r, source.fieldId)?.state === "ok");
    return hasValue ? excluded("기준 없음", "입력된 값에 대한 점수가 없습니다") : excluded("미수집", "값이 입력된 내역 없음");
  }
  const data = `${filterText}${rowScores.map((r) => r.text).join(", ")}`;
  const scores = rowScores.map((r) => r.score);
  const max = Math.max(...scores);
  if (source.aggregate === "avg") return scored(scores.reduce((a, b) => a + b, 0) / scores.length, data, "여러 건의 평균");
  if (source.aggregate === "maxPlus" && scores.length > 1) {
    const total = Math.min(100, max + source.bonusPerExtra * (scores.length - 1));
    return scored(total, data, `최고 ${fmt(max)}점 + 추가 ${scores.length - 1}건 × ${fmt(source.bonusPerExtra)}점 (상한 100)`);
  }
  return scored(max, data, scores.length > 1 ? "여러 건 중 최고값" : "선택지 점수");
}

function evaluateItem(item: Item, student: ParsedStudent, rubric: Rubric, qual: QualMap): ItemResult {
  const sources: SourceResult[] = item.sources.map((source) => ({
    sourceId: source.id,
    label: fieldLabel(source.fieldId),
    method: source.method,
    ...scoreSource(source, student, rubric, qual),
  }));
  const scores = sources.filter((s) => s.status === "scored").map((s) => s.score as number);
  const base = {
    itemId: item.id,
    name: item.name,
    kind: item.kind,
    weight: item.weight,
    qualitative: item.sources.length > 0 && item.sources.every((s) => s.method === "narrative"),
    contribution: null,
    sources,
  };
  if (scores.length === 0) {
    const reasons = sources.map((s) => s.reason);
    const reason: ExcludeReason =
      reasons.length > 0 && reasons.every((r) => r === "해당 없음") ? "해당 없음" : (reasons.find((r) => r && r !== "해당 없음") ?? "미수집");
    return { ...base, status: "excluded", reason, score: null };
  }
  const score = item.combine === "avg" ? scores.reduce((a, b) => a + b, 0) / scores.length : Math.max(...scores);
  return { ...base, status: "scored", reason: null, score: round2(score) };
}

function gradeOf(score: number, rubric: Rubric): string {
  const grades = [...rubric.settings.grades].sort((a, b) => b.min - a.min);
  return (grades.find((g) => score >= g.min) ?? grades[grades.length - 1]).grade;
}

export function evaluateCompetency(competency: Competency, student: ParsedStudent, rubric: Rubric, qual: QualMap = {}): CompetencyResult {
  const items = competency.items.map((item) => evaluateItem(item, student, rubric, qual));
  const basic = items.filter((i) => i.kind === "basic");
  const included = basic.filter((i) => i.status === "scored");
  const sum = (list: ItemResult[]) => list.reduce((acc, i) => acc + i.weight, 0);

  const includedWeight = sum(included);
  const denominator = sum(basic) - sum(basic.filter((i) => i.status === "excluded" && i.reason === "해당 없음"));
  const coverage = denominator > 0 ? round2((includedWeight / denominator) * 100) : 0;

  for (const item of included) item.contribution = round2(((item.score as number) * item.weight) / includedWeight);
  const bonus = items.filter((i) => i.kind === "bonus" && i.status === "scored");
  for (const item of bonus) item.contribution = round2(((item.score as number) * item.weight) / 100);

  const parts = [...included, ...bonus];
  let raw = round2(parts.reduce((acc, i) => acc + (i.contribution as number), 0));
  const adjustments: CompetencyResult["adjustments"] = [];

  const qualItems = included.filter((i) => i.qualitative);
  const quantItems = included.filter((i) => !i.qualitative);
  if (qualItems.length > 0 && quantItems.length > 0) {
    const quantWeight = sum(quantItems);
    const quantOnly = round2(
      quantItems.reduce((acc, i) => acc + ((i.score as number) * i.weight) / quantWeight, 0) + bonus.reduce((acc, i) => acc + (i.contribution as number), 0),
    );
    const swing = rubric.settings.qualSwing;
    const limited = Math.min(Math.max(raw, quantOnly - swing), quantOnly + swing);
    if (limited !== raw) {
      adjustments.push({ label: `서술 판정 변동폭 제한(정량 ${fmt(quantOnly)}점 ±${swing})`, amount: round2(limited - raw) });
      raw = round2(limited);
    }
  }
  if (raw > 100) {
    adjustments.push({ label: "상한 100점", amount: round2(100 - raw) });
    raw = 100;
  }

  const hold = includedWeight === 0 || coverage < rubric.settings.holdThreshold;
  const score = hold ? null : Math.round(raw);
  const qualShare = includedWeight > 0 ? (sum(qualItems) / includedWeight) * 100 : 0;
  let reliability: CompetencyResult["reliability"] = null;
  if (!hold) {
    if (coverage < 60 || quantItems.length === 0) reliability = "하";
    else if (coverage >= 80 && qualShare <= rubric.settings.qualWeightCap) reliability = "상";
    else reliability = "중";
  }

  const terms = [
    ...included.map((i) => `${fmt(i.score as number)}×${fmt(i.weight)}`),
  ];
  let formula = included.length > 0 ? `(${terms.join(" + ")}) ÷ ${fmt(includedWeight)}` : "계산에 쓸 항목 없음";
  for (const item of bonus) formula += ` + 가점 ${fmt(item.contribution as number)}`;
  for (const adj of adjustments) formula += ` ${adj.amount >= 0 ? "+" : "−"} ${fmt(Math.abs(adj.amount))}`;
  formula += ` = ${fmt(raw)}`;

  const recomputed = round2(parts.reduce((acc, i) => acc + (i.contribution as number), 0) + adjustments.reduce((acc, a) => acc + a.amount, 0));

  return {
    competencyId: competency.id,
    group: competency.group,
    name: competency.name,
    hold,
    score,
    rawScore: includedWeight === 0 ? null : raw,
    grade: score === null ? null : gradeOf(score, rubric),
    coverage,
    reliability,
    adjustments,
    formula,
    checksumOk: recomputed === raw,
    items,
    missing: basic
      .filter((i) => i.status === "excluded" && i.reason !== "해당 없음")
      .map((i) => `${i.name}: ${i.sources.map((s) => s.label).join(", ")}`),
  };
}

export function evaluateStudent(rubric: Rubric, student: ParsedStudent, qual: QualMap = {}): StudentEvaluation {
  return { competencies: rubric.competencies.map((c) => evaluateCompetency(c, student, rubric, qual)) };
}

export function usedCategoryIds(rubric: Rubric): Set<string> {
  const used = new Set<string>();
  for (const competency of rubric.competencies) {
    for (const item of competency.items) {
      for (const source of item.sources) {
        const ref = findField(source.fieldId);
        if (ref) used.add(ref.category.id);
      }
    }
  }
  return used;
}
