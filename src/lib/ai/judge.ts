import { createHash } from "node:crypto";
import { z } from "zod";
import type { QualJudgment, QualMap } from "@/lib/rubric/engine";
import { findField } from "@/lib/rubric/fields";
import type { Competency, Item, Rubric, Source } from "@/lib/rubric/types";
import type { ParsedStudent } from "@/lib/template/parse";
import { loadPrompt, type StructuredCall } from "./client";
import { AI_CONFIG } from "./config";

export const judgmentSchema = z.object({
  level: z.number().int().min(1).max(5).nullable(),
  quotes: z.array(z.string()),
  reason: z.string(),
  adjacentReason: z.string(),
  borderline: z.boolean(),
  injectionSuspected: z.boolean(),
});

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** 판정에 보낼 글만 모은다. 이름·학번 등 식별정보는 포함하지 않는다. */
export function narrativeText(source: Source, student: ParsedStudent): string | null {
  const ref = findField(source.fieldId);
  if (!ref) return null;
  const category = student.categories.find((c) => c.id === ref.category.id);
  if (!category || category.status !== "값 있음") return null;
  const isText = (type: string) => type === "text" || type === "narrative";
  if (!ref.inTable) {
    const field = category.fields.find((f) => f.id === source.fieldId);
    return field?.state === "ok" ? String(field.value) : null;
  }
  let rows = category.rows;
  if (source.filter) {
    const { fieldId, values } = source.filter;
    rows = rows.filter((r) => values.includes(String(r.cells.find((c) => c.id === fieldId)?.value)));
  }
  const blocks = rows
    .map((row) => row.cells.filter((c) => c.state === "ok" && isText(c.type)).map((c) => `${c.label}: ${c.value}`).join("\n"))
    .filter((b) => b !== "");
  return blocks.length > 0 ? blocks.map((b, i) => `[${i + 1}번 기록]\n${b}`).join("\n\n") : null;
}

export const quotesVerified = (quotes: string[], text: string) => quotes.length > 0 && quotes.every((q) => squash(q) !== "" && squash(text).includes(squash(q)));

const INJECTION = /(점|레벨|등급).{0,10}(줘|주세요|부여|매겨)|지시.{0,6}무시|ignore (all|previous)|system prompt/i;

export function cacheKey(rubricKey: string, source: Source, text: string, promptVersion: string, model: string): string {
  return createHash("sha256").update(JSON.stringify([rubricKey, source.id, source.levels, source.undecidable, text, promptVersion, model])).digest("hex");
}

export async function judgeSource(call: StructuredCall, competency: Competency, item: Item, source: Source, text: string): Promise<QualJudgment> {
  const system = await loadPrompt(AI_CONFIG.judge.promptFile);
  const user = [
    `역량: ${competency.name} — ${competency.description}`,
    `평가 항목: ${item.name} — ${item.description}`,
    "레벨 기준문:",
    ...[...source.levels].sort((a, b) => a.level - b.level).map((l) => `- 레벨 ${l.level}: ${l.criterion}`),
    `판단 불가 조건: ${source.undecidable || "판정할 근거가 없음"}`,
    "",
    "<student_text>",
    text,
    "</student_text>",
  ].join("\n");
  const flaggedByCode = INJECTION.test(text);

  for (let attempt = 0; attempt <= AI_CONFIG.judge.retries; attempt++) {
    let result: z.infer<typeof judgmentSchema>;
    try {
      result = await call({ system, user, schema: judgmentSchema, effort: AI_CONFIG.judge.effort, maxTokens: AI_CONFIG.judge.maxTokens });
    } catch {
      continue;
    }
    const flagged = flaggedByCode || result.injectionSuspected;
    if (result.level === null) return { level: null, quotes: [], reason: result.reason, adjacentReason: "", borderline: false, flagged };
    if (quotesVerified(result.quotes, text)) {
      return { level: result.level, quotes: result.quotes, reason: result.reason, adjacentReason: result.adjacentReason, borderline: result.borderline, flagged };
    }
  }
  return { level: null, quotes: [], reason: "인용문이 학생 원문과 일치하지 않아 판정을 무효로 했습니다", adjacentReason: "", borderline: false, flagged: flaggedByCode };
}

export interface JudgeCache {
  get(key: string): QualJudgment | null;
  set(key: string, value: QualJudgment): void;
}

/** 한 학생의 서술 판정을 모두 수행한다. call이 없으면(AI 미설정) 캐시에 있는 것만 쓴다. */
export async function judgeStudent(call: StructuredCall | null, rubric: Rubric, rubricKey: string, student: ParsedStudent, cache: JudgeCache, rejudge = false): Promise<QualMap> {
  const result: QualMap = {};
  for (const competency of rubric.competencies) {
    for (const item of competency.items) {
      for (const source of item.sources) {
        if (source.method !== "narrative") continue;
        const text = narrativeText(source, student);
        if (text === null) continue;
        const key = cacheKey(rubricKey, source, text, AI_CONFIG.judge.promptFile, AI_CONFIG.model);
        const cached = rejudge ? null : cache.get(key);
        if (cached) {
          result[source.id] = cached;
        } else if (call) {
          const judgment = await judgeSource(call, competency, item, source, text);
          cache.set(key, judgment);
          result[source.id] = judgment;
        }
      }
    }
  }
  return result;
}
