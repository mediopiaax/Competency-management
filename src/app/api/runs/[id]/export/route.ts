import ExcelJS from "exceljs";
import { runs } from "@/lib/db";
import type { RunResult } from "@/lib/run";
import { currentWorkspace, fail, noWorkspace } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspace();
  if (!ws) return noWorkspace();
  const { id } = await params;
  const run = runs.get(ws.id, id) as RunResult | null;
  if (!run) return fail("평가 결과를 찾지 못했습니다", 404);

  if (new URL(request.url).searchParams.get("format") === "json") {
    return new Response(JSON.stringify(run, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="evaluation-${id}.json"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet("실행 정보");
  info.addRows([
    ["채점기준표", run.rubric.name], ["버전", run.rubric.version], ["실행 시각", run.executedAt],
    ["AI 모델", run.ai.model ?? "사용 안 함"], ["서술 판정 프롬프트", run.ai.judgePrompt],
    ...run.excluded.map((e) => ["평가 제외", `${e.name}: ${e.reason}`]),
  ]);

  const summary = wb.addWorksheet("역량별 점수");
  summary.addRow(["이름", "학번", "구분", "역량", "점수", "등급", "데이터 충족도(%)", "신뢰도", "계산식", "검산"]);
  const detail = wb.addWorksheet("항목별 근거");
  detail.addRow(["이름", "학번", "구분", "역량", "평가 항목", "유형", "비중", "항목 점수", "기여 점수", "제외 사유", "근거 데이터", "방식", "사용한 데이터", "적용 기준", "근거 점수"]);
  for (const s of run.students) {
    for (const c of s.evaluation.competencies) {
      summary.addRow([s.name, s.studentId, c.group, c.name, c.score ?? "판정 보류", c.grade ?? "-", c.coverage, c.reliability ?? "-", c.formula, c.checksumOk ? "일치" : "불일치"]);
      for (const i of c.items) {
        for (const src of i.sources) {
          detail.addRow([
            s.name, s.studentId, c.group, c.name, i.name, i.kind === "bonus" ? "가점형" : "기본형", i.weight, i.score ?? "", i.contribution ?? "", i.reason ?? "",
            src.label, src.method, src.data, src.rule, src.score ?? (src.reason ?? ""),
          ]);
        }
      }
    }
  }
  for (const sheet of [info, summary, detail]) {
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col) => (col.width = 18));
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="evaluation-${id}.xlsx"`,
    },
  });
}
