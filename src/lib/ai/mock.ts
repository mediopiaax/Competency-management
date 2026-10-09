import type { CompetencyInput } from "@/lib/competency/parse-list";
import type { QualJudgment } from "@/lib/rubric/engine";
import { fieldIdOf } from "@/lib/rubric/fields";
import { generateRubricByRules } from "@/lib/rubric/generate-rules";
import { DEFAULT_LEVELS, DEFAULT_UNDECIDABLE } from "@/lib/rubric/presets";
import type { Rubric } from "@/lib/rubric/types";

/** AI 키가 없을 때 쓰는 데모용 대체물. 화면에는 항상 '데모'라고 표시한다. */

const QUALITATIVE = /리더십|문제해결|커뮤니케이션|소통|대인관계|도전|협업|창의/;
const NARRATIVE_WEIGHT = 20;

/** 규칙 기반 초안에 서술 판정 항목을 더한 데모 초안 */
export function generateDemoRubric(name: string, list: CompetencyInput[]): Rubric {
  const rubric = generateRubricByRules(name, list);
  const fieldId = fieldIdOf(33, "행동(A)");
  for (const competency of rubric.competencies) {
    const basic = competency.items.filter((i) => i.kind === "basic");
    if (basic.length === 0 || !QUALITATIVE.test(competency.name)) continue;
    let rest = 100 - NARRATIVE_WEIGHT;
    basic.forEach((item, i) => {
      item.weight = i === basic.length - 1 ? rest : Math.round((item.weight * rest) / 100);
      rest -= i === basic.length - 1 ? 0 : item.weight;
    });
    competency.items.push({
      id: `${competency.id}-q`,
      name: "경험 서술의 구체성",
      description: "활동 성찰 기록에 본인의 행동과 결과가 얼마나 구체적으로 드러나는지 봅니다",
      weight: NARRATIVE_WEIGHT,
      kind: "basic",
      combine: "max",
      sources: [{
        id: `${competency.id}-q-s1`, fieldId, method: "narrative", aggregate: "max", bonusPerExtra: 0, perSemester: false,
        bands: [], options: [], filter: null, multiplier: null, levels: structuredClone(DEFAULT_LEVELS), undecidable: DEFAULT_UNDECIDABLE,
      }],
    });
  }
  return rubric;
}

const part = (text: string, label: string) => text.match(new RegExp(`^${label.replace(/[()]/g, "\\$&")}: (.+)$`, "m"))?.[1].trim() ?? "";
const clip = (s: string) => (s.length > 70 ? s.slice(0, 70) : s);

/** 기본 레벨 기준문(행동 건수, 결과의 사실·수치 여부)을 글자 규칙으로 흉내 낸 데모 판정. 인용은 원문 그대로다. */
export function mockJudgment(text: string): QualJudgment {
  const situation = part(text, "상황(S)");
  const action = part(text, "행동(A)");
  const result = part(text, "결과(R)");
  const actions = action ? action.split(/,|·|하고 | 및 | 후 /).filter((s) => s.trim().length > 3).length : 0;
  const numeric = /\d/.test(result);
  const base = { borderline: false, flagged: false };

  if (!situation && !action && !result) {
    return { level: null, quotes: [], reason: "상황·행동·결과 서술이 비어 있어 판단할 수 없습니다", adjacentReason: "", ...base };
  }
  if (!action) {
    const long = situation.length > 40;
    return {
      level: long ? 2 : 1,
      quotes: [clip(situation || result)],
      reason: long ? "상황 서술 안에 본인의 행동이 한 번 언급되지만 행동과 결과가 따로 정리되어 있지 않습니다" : "활동이 언급만 되어 있고 본인의 행동이 서술되지 않았습니다",
      adjacentReason: "행동(A)과 결과(R) 칸이 비어 있어 상황·행동·결과가 모두 갖춰진 레벨 3으로 보기 어렵습니다",
      ...base,
    };
  }
  if (!result || !situation) {
    return { level: 2, quotes: [clip(action)], reason: "본인의 행동은 서술되어 있으나 상황이나 결과와 연결되지 않습니다", adjacentReason: "결과 서술이 없어 레벨 3 기준을 채우지 못합니다", ...base };
  }
  if (actions < 2) {
    return { level: 3, quotes: [clip(action), clip(result)], reason: "상황, 본인의 행동, 결과가 모두 한 건씩 서술되어 있습니다", adjacentReason: "구체적인 행동이 한 건이라 레벨 4(행동 2건 이상)에는 못 미칩니다", ...base };
  }
  return numeric
    ? { level: 5, quotes: [clip(action), clip(result)], reason: `본인의 행동이 ${actions}건 구체적으로 서술되어 있고 결과가 수치로 제시되어 있습니다`, adjacentReason: "", ...base }
    : { level: 4, quotes: [clip(action), clip(result)], reason: `본인의 행동이 ${actions}건 구체적으로 서술되어 있고 결과가 사실로 제시되어 있습니다`, adjacentReason: "결과에 수치가 없어 레벨 5에는 못 미칩니다", ...base };
}
