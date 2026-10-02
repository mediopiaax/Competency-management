import { fieldLabel, findField } from "./fields";
import type { Band, Competency, Rubric, Source } from "./types";

export interface RubricIssue {
  level: "error" | "warn";
  code: string;
  message: string;
  competencyId?: string;
  itemId?: string;
}

function bandProblems(bands: Band[]): string[] {
  if (bands.length === 0) return ["구간표가 비어 있습니다"];
  const problems: string[] = [];
  const mins = bands.map((b) => b.min);
  if (new Set(mins).size !== mins.length) problems.push("같은 시작값을 가진 구간이 두 개 이상입니다");
  const lowest = Math.min(...mins);
  if (lowest > 0) problems.push(`0 이상 ${lowest} 미만 구간이 비어 있습니다`);
  return problems;
}

function sourceSignature(source: Source) {
  return `${source.fieldId}|${source.filter ? `${source.filter.fieldId}=${[...source.filter.values].sort().join(",")}` : ""}`;
}

function validateCompetency(competency: Competency, rubric: Rubric, issues: RubricIssue[]) {
  const at = { competencyId: competency.id };
  const prefix = `[${competency.group ? `${competency.group} · ` : ""}${competency.name}]`;
  if (competency.items.length === 0) {
    issues.push({ level: "warn", code: "NO_ITEMS", message: `${prefix} 평가 항목이 없어 이 역량은 항상 판정 보류가 됩니다`, ...at });
    return;
  }
  const basic = competency.items.filter((i) => i.kind === "basic");
  const total = basic.reduce((acc, i) => acc + i.weight, 0);
  if (Math.abs(total - 100) > 0.01) {
    issues.push({ level: "error", code: "WEIGHT_SUM", message: `${prefix} 기본형 항목의 비중 합계가 ${Math.round(total * 100) / 100}%입니다(100%여야 함)`, ...at });
  }
  if (competency.items.length < 2 || competency.items.length > 4) {
    issues.push({ level: "warn", code: "ITEM_COUNT", message: `${prefix} 평가 항목이 ${competency.items.length}개입니다(권장 2~4개)`, ...at });
  }

  const seen = new Map<string, string>();
  for (const item of competency.items) {
    const where = { ...at, itemId: item.id };
    const name = `${prefix} '${item.name}'`;
    if (item.sources.length === 0) {
      issues.push({ level: "error", code: "NO_SOURCE", message: `${name}: 근거 데이터가 없습니다`, ...where });
      continue;
    }
    if (item.sources.length === 1) issues.push({ level: "warn", code: "SINGLE_SOURCE", message: `${name}: 근거 데이터가 하나뿐입니다(단일 근거)`, ...where });
    if (item.sources.length > 3) issues.push({ level: "warn", code: "SOURCE_COUNT", message: `${name}: 근거 데이터가 ${item.sources.length}개입니다(권장 1~3개)`, ...where });

    for (const source of item.sources) {
      const ref = findField(source.fieldId);
      const label = fieldLabel(source.fieldId);
      const error = (code: string, message: string) => issues.push({ level: "error", code, message: `${name} › ${label}: ${message}`, ...where });
      const warn = (code: string, message: string) => issues.push({ level: "warn", code, message: `${name} › ${label}: ${message}`, ...where });
      if (!ref) {
        error("UNKNOWN_FIELD", "템플릿에 없는 데이터입니다");
        continue;
      }
      if (ref.category.excludedFromScoring) error("EXCLUDED_FIELD", "자기진단·인증 현황 데이터는 점수 계산에 쓸 수 없습니다");

      const signature = sourceSignature(source);
      const other = seen.get(signature);
      if (other && other !== item.id) warn("DUPLICATE_EVIDENCE", "같은 데이터가 이 역량의 다른 항목에서도 점수화됩니다(중복 가산 의심)");
      seen.set(signature, item.id);

      if (source.filter && findField(source.filter.fieldId)?.category.id !== ref.category.id) error("FILTER_FIELD", "조건에 쓴 데이터가 같은 표에 없습니다");

      if (source.method === "range") {
        for (const problem of bandProblems(source.bands)) error("BAND_GAP", problem);
        if (ref.field.type !== "number" && !(ref.inTable && source.aggregate === "count")) error("RANGE_TYPE", "숫자가 아닌 데이터에는 숫자 구간을 쓸 수 없습니다('건수로 구간'은 가능)");
        if (source.perSemester) {
          const asc = [...source.bands].sort((a, b) => a.min - b.min);
          if (asc.length >= 2 && asc[0].score === 0 && asc[1].min >= 1) {
            warn("SEMESTER_ZERO", `학기당 값이 0보다 크고 ${asc[1].min}보다 작으면 0점이 됩니다`);
          }
        }
      } else if (source.method === "choice") {
        if (source.options.length === 0) error("NO_OPTIONS", "선택지 점수가 비어 있습니다");
        else if (ref.field.options) {
          const missing = ref.field.options.filter((o) => !source.options.some((s) => s.value === o));
          if (missing.length > 0) error("CHOICE_GAP", `점수가 없는 선택지: ${missing.join(", ")}`);
        }
      } else if (source.method === "language") {
        if (!ref.category.table?.columns.some((c) => c.label === "시험명")) error("LANGUAGE_FIELD", "어학 환산표는 어학 성적 데이터에만 쓸 수 있습니다");
      } else {
        const levels = new Set(source.levels.filter((l) => l.criterion.trim() !== "").map((l) => l.level));
        if (![1, 2, 3, 4, 5].every((l) => levels.has(l))) error("LEVELS", "1~5 레벨 기준문이 모두 있어야 합니다");
        if (source.undecidable.trim() === "") warn("NO_UNDECIDABLE", "'판단 불가' 조건이 비어 있습니다");
        if (ref.field.type !== "text" && ref.field.type !== "narrative") error("NARRATIVE_TYPE", "서술 판정은 글로 된 데이터에만 쓸 수 있습니다");
      }
    }
  }

  const qualWeight = basic.filter((i) => i.sources.length > 0 && i.sources.every((s) => s.method === "narrative")).reduce((acc, i) => acc + i.weight, 0);
  if (qualWeight > rubric.settings.qualWeightCap) {
    issues.push({ level: "warn", code: "QUAL_WEIGHT", message: `${prefix} 서술 판정 비중이 ${qualWeight}%입니다(상한 ${rubric.settings.qualWeightCap}%)`, ...at });
  }
}

export function validateRubric(rubric: Rubric): RubricIssue[] {
  const issues: RubricIssue[] = [];
  if (!rubric.settings.grades.some((g) => g.min <= 0)) {
    issues.push({ level: "error", code: "GRADE_GAP", message: "등급 기준에 0점부터 시작하는 등급이 없습니다" });
  }
  for (const entry of rubric.languageTable) {
    if (entry.basis === "score") {
      for (const problem of bandProblems(entry.bands)) issues.push({ level: "error", code: "BAND_GAP", message: `[어학 환산표] ${entry.exam}: ${problem}` });
    } else if (entry.options.length === 0) {
      issues.push({ level: "error", code: "NO_OPTIONS", message: `[어학 환산표] ${entry.exam}: 등급별 점수가 비어 있습니다` });
    }
  }
  for (const competency of rubric.competencies) validateCompetency(competency, rubric, issues);
  return issues;
}

export const hasBlockingIssues = (issues: RubricIssue[]) => issues.some((i) => i.level === "error");
