import { runs } from "@/lib/db";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const run = runs.get(ws.id, (await params).id);
  return run ? Response.json({ run, workspace: ws }) : fail("평가 결과를 찾지 못했습니다", 404);
}
