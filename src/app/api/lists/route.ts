import { lists } from "@/lib/db";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

export async function GET() {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  return Response.json({ lists: lists.list(ws.id) });
}

export async function POST(request: Request) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { name, competencies } = await request.json();
  if (typeof name !== "string" || name.trim() === "" || !Array.isArray(competencies) || competencies.length === 0) return fail("목록 이름과 역량이 필요합니다");
  if (competencies.some((c) => !c?.name)) return fail("역량명이 빈 행이 있습니다");
  return Response.json({ id: lists.create(ws.id, name.trim(), competencies) });
}
