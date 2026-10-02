import { workspaces } from "@/lib/db";
import { currentWorkspace, fail, selectWorkspace } from "@/lib/session";

export async function GET() {
  return Response.json({ workspaces: workspaces.list(), current: await currentWorkspace() });
}

export async function POST(request: Request) {
  const { kind, name } = await request.json();
  if ((kind !== "institution" && kind !== "student") || typeof name !== "string" || name.trim() === "") return fail("유형과 이름을 입력하세요");
  const ws = workspaces.create(kind, name.trim());
  await selectWorkspace(ws.id);
  return Response.json({ current: ws });
}

export async function PUT(request: Request) {
  const { id } = await request.json();
  const ws = workspaces.get(id);
  if (!ws) return fail("없는 작업 공간입니다", 404);
  await selectWorkspace(ws.id);
  return Response.json({ current: ws });
}
