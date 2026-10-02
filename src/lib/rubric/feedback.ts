import type { CompetencyResult, ItemResult, StudentEvaluation } from "./engine";
import { findField } from "./fields";
import type { Rubric, Source } from "./types";

export interface FeedbackLine { competency: string; item: string; text: string }
export interface Feedback { strengths: FeedbackLine[]; improvements: FeedbackLine[]; toRegister: string[] }

function nextStep(source: Source | undefined, current: number): string {
  if (!source) return "";
  if (source.method === "range") {
    const higher = [...source.bands].sort((a, b) => a.min - b.min).find((b) => b.score > current);
    const label = findField(source.fieldId)?.field.label ?? "";
    if (higher) return `${label}${source.aggregate === "count" ? " 건수" : ""}${source.perSemester ? "(학기당)" : ""}을(를) ${higher.min} 이상으로 올리면 이 근거의 점수가 ${higher.score}점이 됩니다.`;
  }
  if (source.method === "choice") {
    const higher = [...source.options].sort((a, b) => a.score - b.score).find((o) => o.score > current);
    if (higher) return `'${higher.value}' 수준의 실적이 있으면 이 근거의 점수가 ${higher.score}점이 됩니다.`;
  }
  if (source.method === "language") return "더 높은 어학 성적을 등록하면 점수가 오릅니다.";
  if (source.method === "narrative") return "활동 기록에 본인의 행동과 결과를 사실과 수치로 더 구체적으로 적으면 판정 레벨이 오를 수 있습니다.";
  return "";
}

export function buildFeedback(rubric: Rubric, evaluation: StudentEvaluation): Feedback {
  const scored: { c: CompetencyResult; i: ItemResult }[] = [];
  for (const c of evaluation.competencies) for (const i of c.items) if (i.status === "scored") scored.push({ c, i });
  const best = (i: ItemResult) => i.sources.filter((s) => s.status === "scored").sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const sourceOf = (c: CompetencyResult, sourceId: string) =>
    rubric.competencies.find((x) => x.id === c.competencyId)?.items.flatMap((x) => x.sources).find((s) => s.id === sourceId);

  const strengths = scored
    .filter(({ i }) => (i.score as number) >= 80)
    .sort((a, b) => (b.i.score as number) - (a.i.score as number))
    .slice(0, 3)
    .map(({ c, i }) => ({ competency: c.name, item: i.name, text: `${best(i)?.label.split(" › ")[0]}: ${best(i)?.data} (${i.score}점)` }));

  const improvements = scored
    .filter(({ i }) => i.kind === "basic" && (i.score as number) < 70)
    .sort((a, b) => (a.i.score as number) - (b.i.score as number))
    .slice(0, 3)
    .map(({ c, i }) => {
      const top = best(i);
      const step = top ? nextStep(sourceOf(c, top.sourceId), top.score ?? 0) : "";
      return { competency: c.name, item: i.name, text: `현재 ${i.score}점 (${top?.data ?? ""}). ${step}`.trim() };
    });

  const toRegister = [...new Set(evaluation.competencies.filter((c) => c.hold).flatMap((c) => c.missing.map((m) => m.split(": ")[1] ?? m)).flatMap((m) => m.split(", ").map((x) => x.split(" › ")[0])))];
  return { strengths, improvements, toRegister };
}
