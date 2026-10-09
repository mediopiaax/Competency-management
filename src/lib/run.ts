import { callClaude } from "@/lib/ai/client";
import { AI_CONFIG, aiAvailable } from "@/lib/ai/config";
import { judgeStudent } from "@/lib/ai/judge";
import { mockJudgment } from "@/lib/ai/mock";
import { qualCache, type RubricRecord, type Submission } from "@/lib/db";
import { evaluateStudent, usedCategoryIds, type QualMap, type StudentEvaluation } from "@/lib/rubric/engine";
import { buildFeedback, type Feedback } from "@/lib/rubric/feedback";
import type { Rubric } from "@/lib/rubric/types";

export interface RunStudent {
  submissionId: string;
  name: string;
  studentId: string | null;
  sheetName: string;
  profile?: { college: string | null; department: string | null; year: string | null };
  evaluation: StudentEvaluation;
  qual: QualMap;
  feedback: Feedback;
  unusedCategories: string[];
}
export interface RunResult {
  rubric: { id: string; name: string; version: string };
  rubricBody: Rubric;
  executedAt: string;
  ai: { used: boolean; demo?: boolean; model: string | null; draftPrompt: string; judgePrompt: string };
  students: RunStudent[];
  excluded: { name: string; reason: string }[];
}

export async function executeRun(record: RubricRecord, targets: Submission[], rejudge: boolean): Promise<RunResult> {
  const rubric = record.body;
  const used = usedCategoryIds(rubric);
  const call = aiAvailable() ? callClaude : null;
  const students: RunStudent[] = [];
  const excluded: RunResult["excluded"] = [];

  for (const submission of targets) {
    const student = submission.student;
    const name = student.name ?? student.sheetName;
    if (!student.evaluable) {
      excluded.push({ name, reason: student.excludedReason ?? "평가 제외" });
      continue;
    }
    if (!student.templateMatched) {
      excluded.push({ name, reason: "템플릿 항목 구성이 달라 평가하지 않았습니다" });
      continue;
    }
    const qual = await judgeStudent(call, rubric, record.id, student, qualCache, rejudge, call ? undefined : mockJudgment);
    const basic = (label: string) => { const v = student.basic.find((f) => f.label === label)?.value; return v === null || v === undefined ? null : String(v); };
    const evaluation = evaluateStudent(rubric, student, qual);
    students.push({
      submissionId: submission.id,
      name,
      studentId: student.studentId,
      sheetName: student.sheetName,
      profile: { college: basic("소속 대학"), department: basic("주전공(학과)"), year: basic("학년") },
      evaluation,
      qual,
      feedback: buildFeedback(rubric, evaluation),
      unusedCategories: student.categories.filter((c) => c.status === "값 있음" && !used.has(c.id)).map((c) => c.label),
    });
  }
  return {
    rubric: { id: record.id, name: record.name, version: record.version ?? "" },
    rubricBody: rubric,
    executedAt: new Date().toISOString(),
    ai: { used: call !== null, demo: call === null, model: call ? AI_CONFIG.model : null, draftPrompt: AI_CONFIG.draft.promptFile, judgePrompt: AI_CONFIG.judge.promptFile },
    students,
    excluded,
  };
}
