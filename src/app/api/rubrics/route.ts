import { callClaude } from "@/lib/ai/client";
import { aiAvailable } from "@/lib/ai/config";
import { generateRubricByAi } from "@/lib/ai/draft";
import { generateDemoRubric } from "@/lib/ai/mock";
import { lists, rubrics } from "@/lib/db";
import { generateRubricByRules } from "@/lib/rubric/generate-rules";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

export async function GET() {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  return Response.json({
    aiAvailable: aiAvailable(),
    rubrics: rubrics.list(ws.id).map((r) => ({
      id: r.id, name: r.name, status: r.status, version: r.version, updatedAt: r.updatedAt, generatedBy: r.body.generatedBy, competencies: r.body.competencies.length,
    })),
  });
}

export async function POST(request: Request) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { listId, mode } = await request.json();
  const list = lists.get(ws.id, listId);
  if (!list) return fail("역량 목록을 찾지 못했습니다", 404);
  // AI 키가 없으면 AI 초안 대신 데모 초안(규칙 기반 + 서술 판정 항목)을 만든다
  const body = mode !== "ai" ? generateRubricByRules(list.name, list.competencies) : aiAvailable() ? await generateRubricByAi(callClaude, list.name, list.competencies) : generateDemoRubric(list.name, list.competencies);
  return Response.json({ id: rubrics.createDraft(ws.id, body, list.id) });
}
