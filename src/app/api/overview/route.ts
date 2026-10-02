import { aiAvailable } from "@/lib/ai/config";
import { auditLog, lists, rubrics, runs, submissions } from "@/lib/db";
import { currentWorkspace, noWorkspace } from "@/lib/session";

export async function GET() {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const allRubrics = rubrics.list(ws.id);
  return Response.json({
    workspace: ws,
    aiAvailable: aiAvailable(),
    counts: {
      lists: lists.list(ws.id).length,
      drafts: allRubrics.filter((r) => r.status === "draft").length,
      confirmed: allRubrics.filter((r) => r.status === "confirmed").length,
      submissions: submissions.list(ws.id).length,
      runs: runs.list(ws.id).length,
    },
    audit: auditLog(ws.id).slice(0, 30),
  });
}
