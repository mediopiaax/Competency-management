import { callClaude } from "@/lib/ai/client";
import { aiAvailable } from "@/lib/ai/config";
import { generateRubricByAi } from "@/lib/ai/draft";
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
  if (mode === "ai" && !aiAvailable()) return fail("AI 키가 설정되지 않았습니다. 규칙 기반 기본 초안을 쓰거나 .env.local에 ANTHROPIC_API_KEY를 넣으세요");
  const body = mode === "ai" ? await generateRubricByAi(callClaude, list.name, list.competencies) : generateRubricByRules(list.name, list.competencies);
  return Response.json({ id: rubrics.createDraft(ws.id, body, list.id) });
}
