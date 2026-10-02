"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Button, Card, ErrorNote, formatTime, PageTitle, sendJson } from "@/components/ui";
import type { ParsedStudent } from "@/lib/template/parse";

interface RubricRow { id: string; name: string; status: string; version: string | null }
interface Submission { id: string; student: ParsedStudent }
interface RunRow { id: string; createdAt: string; rubricName: string; version: string; students: number }

export default function EvaluatePage() {
  const router = useRouter();
  const [rubrics, setRubrics] = useState<RubricRow[]>([]);
  const [rubricId, setRubricId] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [rejudge, setRejudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      api<{ rubrics: RubricRow[]; aiAvailable: boolean }>("/api/rubrics"),
      api<{ submissions: Submission[] }>("/api/submissions"),
      api<{ runs: RunRow[] }>("/api/runs"),
    ]).then(([r, s, h]) => {
      const confirmed = r.rubrics.filter((x) => x.status === "confirmed");
      setRubrics(confirmed); setRubricId(confirmed[0]?.id ?? ""); setAiAvailable(r.aiAvailable);
      setSubmissions(s.submissions); setChosen(new Set(s.submissions.filter((x) => x.student.evaluable).map((x) => x.id)));
      setRuns(h.runs);
    }).catch(setError);
  }, []);

  async function run() {
    setBusy(true); setError(null);
    try {
      const { id } = await sendJson<{ id: string }>("/api/runs", { rubricId, submissionIds: [...chosen], rejudge });
      router.push(`/results/${id}`);
    } catch (e) { setError(e); setBusy(false); }
  }
  const toggle = (id: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="space-y-8">
      <PageTitle title="4. 평가 실행">확정된 채점기준표 버전을 골라 학생 데이터를 평가합니다. 숫자·목록 항목은 정해진 규칙으로 계산하므로 같은 데이터와 같은 버전이면 결과가 항상 같습니다.</PageTitle>
      <ErrorNote error={error} />

      <Card className="space-y-4 p-5">
        {rubrics.length === 0 ? (
          <p className="text-sm text-slate-600">확정된 채점기준표가 없습니다. <Link href="/rubrics" className="font-medium text-blue-700 underline">채점기준표</Link>에서 초안을 확정하세요.</p>
        ) : (
          <label className="flex flex-wrap items-center gap-2 text-sm">채점기준표
            <select value={rubricId} onChange={(e) => setRubricId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">
              {rubrics.map((r) => <option key={r.id} value={r.id}>{r.name} {r.version}</option>)}
            </select>
          </label>
        )}
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-600">학생 데이터가 없습니다. <Link href="/students" className="font-medium text-blue-700 underline">학생 데이터</Link>를 올리세요.</p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-slate-600">평가할 학생 ({chosen.size}/{submissions.length})</p>
            <div className="flex flex-wrap gap-2">
              {submissions.map(({ id, student }) => (
                <label key={id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${student.evaluable ? "border-slate-300" : "border-slate-200 text-slate-400"}`} title={student.excludedReason ?? ""}>
                  <input type="checkbox" disabled={!student.evaluable} checked={chosen.has(id)} onChange={() => toggle(id)} />
                  {student.name ?? student.sheetName}{!student.evaluable && " (제외)"}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <Button variant="primary" disabled={busy || !rubricId || chosen.size === 0} onClick={run}>{busy ? "평가하는 중…" : "평가 실행"}</Button>
          {aiAvailable ? (
            <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={rejudge} onChange={(e) => setRejudge(e.target.checked)} />서술 판정을 다시 받기 (기본은 이전 판정 재사용)</label>
          ) : (
            <span className="text-sm text-amber-800">AI 키가 없어 서술 판정 항목은 &apos;판단 불가&apos;로 계산에서 빠집니다.</span>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600"><tr><th className="px-4 py-2">실행 시각</th><th className="px-4 py-2">채점기준표</th><th className="px-4 py-2">학생 수</th><th className="px-4 py-2" /></tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">아직 실행한 평가가 없습니다.</td></tr>}
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{formatTime(r.createdAt)}</td>
                <td className="px-4 py-2">{r.rubricName} {r.version}</td>
                <td className="px-4 py-2">{r.students}</td>
                <td className="px-4 py-2 text-right"><Link href={`/results/${r.id}`} className="font-medium text-blue-700 hover:underline">결과 보기</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
