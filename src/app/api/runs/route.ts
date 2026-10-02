import { audit, rubrics, runs, submissions } from "@/lib/db";
import { executeRun } from "@/lib/run";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

export async function GET() {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  return Response.json({ runs: runs.list(ws.id) });
}

export async function POST(request: Request) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { rubricId, submissionIds, rejudge } = await request.json();
  const record = rubrics.get(ws.id, rubricId);
  if (!record) return fail("채점기준표를 찾지 못했습니다", 404);
  if (record.status !== "confirmed") return fail("확정된 채점기준표로만 평가할 수 있습니다");
  const all = submissions.list(ws.id);
  const targets = Array.isArray(submissionIds) ? all.filter((s) => submissionIds.includes(s.id)) : all;
  if (targets.length === 0) return fail("평가할 학생 데이터가 없습니다");
  const result = await executeRun(record, targets, rejudge === true);
  const id = runs.create(ws.id, record.id, result);
  audit(ws.id, "평가 실행", `${record.name} ${record.version} · ${result.students.length}명`);
  return Response.json({ id });
}
