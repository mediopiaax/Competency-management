import { readFile } from "node:fs/promises";
import path from "node:path";
import { audit, submissions } from "@/lib/db";
import { parseWorkbook } from "@/lib/template/parse";
import { readWorkbook } from "@/lib/template/read-workbook";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

const SAMPLE = "학생역량_데이터수집_템플릿_v1 (1).xlsx";
const MAX_BYTES = 20 * 1024 * 1024;

export async function GET() {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  return Response.json({ submissions: submissions.list(ws.id) });
}

export async function POST(request: Request) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const form = await request.formData();
  const inputs: { name: string; data: ArrayBuffer | Buffer }[] = [];
  if (form.get("sample") === "1") {
    inputs.push({ name: SAMPLE, data: await readFile(path.join(process.cwd(), "docs", "reference", SAMPLE)) });
  } else {
    for (const file of form.getAll("files")) {
      if (file instanceof File && file.size <= MAX_BYTES) inputs.push({ name: file.name, data: await file.arrayBuffer() });
    }
  }
  if (inputs.length === 0) return fail("파일이 없거나 20MB를 넘습니다");

  const report: { fileName: string; saved: number; error?: string }[] = [];
  for (const input of inputs) {
    try {
      const students = parseWorkbook(await readWorkbook(input.data)).students.filter((s) => !s.isExample);
      if (ws.kind === "student" && students.length > 1) {
        report.push({ fileName: input.name, saved: 0, error: "학생 작업 공간에는 본인 데이터 한 명만 올릴 수 있습니다" });
        continue;
      }
      if (ws.kind === "student") submissions.clear(ws.id);
      students.forEach((s) => submissions.upsert(ws.id, input.name, s));
      report.push({ fileName: input.name, saved: students.length, error: students.length === 0 ? "학생 데이터 시트를 찾지 못했습니다" : undefined });
    } catch {
      report.push({ fileName: input.name, saved: 0, error: "엑셀 파일(.xlsx)을 읽지 못했습니다" });
    }
  }
  const total = report.reduce((acc, r) => acc + r.saved, 0);
  if (total > 0) audit(ws.id, "학생 데이터 업로드", `${total}명`);
  return Response.json({ report, submissions: submissions.list(ws.id) });
}

export async function DELETE(request: Request) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { id } = await request.json();
  submissions.remove(ws.id, id);
  return Response.json({ submissions: submissions.list(ws.id) });
}
