import { z } from "zod";
import type { CompetencyInput } from "@/lib/competency/parse-list";
import { findField, selectableFields } from "@/lib/rubric/fields";
import { generateCompetencyByRules } from "@/lib/rubric/generate-rules";
import { DEFAULT_LANGUAGE_TABLE } from "@/lib/rubric/language";
import { presetFor } from "@/lib/rubric/presets";
import { DEFAULT_SETTINGS, METHOD_LABEL, type Competency, type Rubric, type Source } from "@/lib/rubric/types";
import { validateRubric } from "@/lib/rubric/validate";
import { loadPrompt, type StructuredCall } from "./client";
import { AI_CONFIG } from "./config";

const draftSourceSchema = z.object({
  fieldId: z.string(),
  method: z.enum(["preset", "narrative"]),
  filterFieldId: z.string().nullable(),
  filterValues: z.array(z.string()),
  levels: z.array(z.string()),
  undecidable: z.string(),
});
export const draftSchema = z.object({
  measurability: z.enum(["상", "중", "하"]),
  note: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      weight: z.number(),
      kind: z.enum(["basic", "bonus"]),
      sources: z.array(draftSourceSchema),
    }),
  ),
});
export type Draft = z.infer<typeof draftSchema>;

export function fieldDictionaryText(): string {
  const lines: string[] = [];
  let category = "";
  for (const ref of selectableFields) {
    if (ref.category.label !== category) {
      category = ref.category.label;
      lines.push(`\n### ${ref.category.no}. ${category} (${ref.category.group})`);
    }
    const preset = presetFor(ref.field.id);
    const parts = [
      ref.field.id,
      ref.field.label,
      ref.inTable ? "표의 열(여러 건)" : "단일 값",
      ref.field.type === "enum" ? `선택지: ${ref.field.options?.join("/")}` : ref.field.type === "number" ? "숫자" : ref.field.type === "narrative" || ref.field.type === "text" ? "글" : "날짜",
    ];
    if (preset) parts.push(`점수 기준 있음(${METHOD_LABEL[preset.method]}${preset.perSemester ? ", 학기당 환산" : ""})`);
    lines.push(`- ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

/** AI 초안을 검증하고 기준표 역량으로 바꾼다. 문제가 있으면 오류 문구 목록을 돌려준다. */
export function draftToCompetency(draft: Draft, input: CompetencyInput, index: number): { competency: Competency; errors: string[] } {
  const id = `c${index + 1}`;
  const errors: string[] = [];
  const items = draft.items.map((item, i) => {
    const sources: Source[] = [];
    item.sources.forEach((s, k) => {
      const ref = findField(s.fieldId);
      const sourceId = `${id}-i${i + 1}-s${k + 1}`;
      if (!ref || ref.category.excludedFromScoring) {
        errors.push(`'${item.name}': 필드 ID "${s.fieldId}"는 사전에 없거나 쓸 수 없습니다`);
        return;
      }
      let filter: Source["filter"] = null;
      if (s.filterFieldId) {
        const filterRef = findField(s.filterFieldId);
        if (!filterRef || filterRef.category.id !== ref.category.id || !filterRef.field.options) {
          errors.push(`'${item.name}': 조건 필드 "${s.filterFieldId}"는 같은 카테고리의 선택지 필드가 아닙니다`);
          return;
        }
        const bad = s.filterValues.filter((v) => !filterRef.field.options!.includes(v));
        if (bad.length > 0 || s.filterValues.length === 0) {
          errors.push(`'${item.name}': 조건 값 ${bad.join(", ") || "(없음)"}이 선택지에 없습니다`);
          return;
        }
        filter = { fieldId: s.filterFieldId, values: s.filterValues };
      }
      if (s.method === "preset") {
        const preset = presetFor(s.fieldId);
        if (!preset) {
          errors.push(`'${item.name}': "${s.fieldId}"에는 기본 점수 기준이 없습니다. '점수 기준 있음' 필드를 쓰거나 글 데이터면 narrative로 하세요`);
          return;
        }
        sources.push({ ...preset, id: sourceId, filter: filter ?? preset.filter });
      } else {
        if (s.levels.length !== 5 || s.levels.some((l) => l.trim() === "")) {
          errors.push(`'${item.name}': 서술 판정에는 레벨 기준문 5개가 필요합니다`);
          return;
        }
        sources.push({
          id: sourceId, fieldId: s.fieldId, method: "narrative", aggregate: "max", bonusPerExtra: 0, perSemester: false, bands: [], options: [],
          filter, multiplier: null, levels: s.levels.map((criterion, l) => ({ level: l + 1, criterion })), undecidable: s.undecidable,
        });
      }
    });
    return { id: `${id}-i${i + 1}`, name: item.name, description: item.description, weight: item.weight, kind: item.kind, combine: "max" as const, sources };
  });

  const competency: Competency = { id, group: input.group, name: input.name, description: input.description, measurability: draft.measurability, note: draft.note, items };
  const blocking = validateRubric({ name: "", generatedBy: "ai", settings: DEFAULT_SETTINGS, languageTable: DEFAULT_LANGUAGE_TABLE, competencies: [competency] }).filter((i) => i.level === "error");
  errors.push(...blocking.map((i) => i.message));
  return { competency, errors };
}

function describe(input: CompetencyInput, all: CompetencyInput[]): string {
  const sameName = all.filter((c) => c.name === input.name && c !== input);
  const lines = [
    `구분: ${input.group || "(없음)"}`,
    `역량명: ${input.name}`,
    `역량 설명: ${input.description || "(없음)"}`,
    "세부 요소:",
    ...(input.elements.length > 0 ? input.elements.map((e) => `- ${e.name}: ${e.description} / 기관이 든 측정지표: ${e.indicators || "(없음)"}`) : ["- (없음)"]),
  ];
  if (sameName.length > 0) lines.push(`참고: 같은 이름의 역량이 다른 구분(${sameName.map((c) => c.group).join(", ")})에도 있다. 이 역량의 설명에 맞는 관점으로 설계한다.`);
  return lines.join("\n");
}

export async function draftCompetency(call: StructuredCall, input: CompetencyInput, index: number, all: CompetencyInput[]): Promise<Competency> {
  const system = `${await loadPrompt(AI_CONFIG.draft.promptFile)}\n\n## 템플릿 필드 사전\n형식: 필드 ID | 이름 | 형태 | 값 | 점수 기준\n${fieldDictionaryText()}`;
  let user = `다음 역량의 채점기준표 초안을 설계하라.\n\n${describe(input, all)}`;
  for (let attempt = 0; attempt <= AI_CONFIG.draft.retries; attempt++) {
    try {
      const draft = await call({ system, user, schema: draftSchema, effort: AI_CONFIG.draft.effort, maxTokens: AI_CONFIG.draft.maxTokens });
      const { competency, errors } = draftToCompetency(draft, input, index);
      if (errors.length === 0) return competency;
      user = `다음 역량의 채점기준표 초안을 설계하라.\n\n${describe(input, all)}\n\n직전 초안은 아래 문제로 거부되었다. 고쳐서 다시 설계하라.\n${errors.map((e) => `- ${e}`).join("\n")}`;
    } catch (error) {
      if (attempt === AI_CONFIG.draft.retries) break;
      void error;
    }
  }
  const fallback = generateCompetencyByRules(input, index);
  fallback.note = `AI 초안이 검증을 통과하지 못해 규칙 기반 기본 초안으로 대신했습니다. ${fallback.note}`.trim();
  return fallback;
}

export async function generateRubricByAi(call: StructuredCall, name: string, list: CompetencyInput[]): Promise<Rubric> {
  const competencies: Competency[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(AI_CONFIG.draft.concurrency, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        competencies[i] = await draftCompetency(call, list[i], i, list);
      }
    }),
  );
  return { name, generatedBy: "ai", settings: structuredClone(DEFAULT_SETTINGS), languageTable: structuredClone(DEFAULT_LANGUAGE_TABLE), competencies };
}
