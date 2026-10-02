import { rubrics } from "@/lib/db";
import { rubricSchema } from "@/lib/rubric/types";
import { hasBlockingIssues, validateRubric } from "@/lib/rubric/validate";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const record = rubrics.get(ws.id, (await params).id);
  if (!record) return fail("채점기준표를 찾지 못했습니다", 404);
  const versions = rubrics.list(ws.id).filter((r) => r.familyId === record.familyId).map((r) => ({ id: r.id, status: r.status, version: r.version, updatedAt: r.updatedAt }));
  return Response.json({ record, versions });
}

export async function PUT(request: Request, { params }: Context) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const parsed = rubricSchema.safeParse((await request.json()).body);
  if (!parsed.success) return fail("채점기준표 형식이 올바르지 않습니다");
  const issues = validateRubric(parsed.data);
  if (hasBlockingIssues(issues)) return Response.json({ error: "오류가 있어 저장하지 않았습니다", issues }, { status: 422 });
  if (!rubrics.saveDraft(ws.id, (await params).id, parsed.data)) return fail("확정된 채점기준표는 수정할 수 없습니다. 새 버전을 만드세요", 409);
  return Response.json({ ok: true });
}

export async function POST(request: Request, { params }: Context) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { id } = await params;
  const { action } = await request.json();
  const record = rubrics.get(ws.id, id);
  if (!record) return fail("채점기준표를 찾지 못했습니다", 404);
  if (action === "confirm") {
    if (hasBlockingIssues(validateRubric(record.body))) return fail("오류가 남아 있어 확정할 수 없습니다", 422);
    const version = rubrics.confirm(ws.id, id);
    return version ? Response.json({ version }) : fail("이미 확정된 채점기준표입니다", 409);
  }
  if (action === "fork") return Response.json({ id: rubrics.fork(ws.id, id) });
  return fail("알 수 없는 요청입니다");
}
