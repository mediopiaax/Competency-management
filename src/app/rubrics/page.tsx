"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Button, Card, ErrorNote, formatTime, PageTitle, sendJson } from "@/components/ui";

interface Row { id: string; name: string; status: "draft" | "confirmed"; version: string | null; updatedAt: string; generatedBy: string; competencies: number }
const ORIGIN: Record<string, string> = { ai: "AI 초안", rules: "규칙 기반 초안", manual: "직접 수정" };

export default function RubricsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [listId, setListId] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api<{ rubrics: Row[]; aiAvailable: boolean }>("/api/rubrics"), api<{ lists: { id: string; name: string }[] }>("/api/lists")])
      .then(([r, l]) => { setRows(r.rubrics); setAiAvailable(r.aiAvailable); setLists(l.lists); setListId(l.lists[0]?.id ?? ""); })
      .catch(setError);
  }, []);

  async function generate(mode: "ai" | "rules") {
    setBusy(mode); setError(null);
    try {
      const { id } = await sendJson<{ id: string }>("/api/rubrics", { listId, mode });
      router.push(`/rubrics/${id}`);
    } catch (e) { setError(e); setBusy(null); }
  }

  return (
    <div className="space-y-8">
      <PageTitle title="2. 채점기준표">역량 목록으로 초안을 만든 뒤, 표에서 확인·수정하고 확정합니다. 확정본은 잠기고 평가에는 확정본만 쓸 수 있습니다.</PageTitle>
      <ErrorNote error={error} />

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">초안 만들기</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-slate-600">먼저 <Link href="/competencies" className="font-medium text-blue-700 underline">역량 목록</Link>을 올리세요.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Button variant="primary" disabled={!aiAvailable || busy !== null} onClick={() => generate("ai")}>{busy === "ai" ? "AI가 설계하는 중… (1~3분)" : "AI로 초안 만들기"}</Button>
            <Button disabled={busy !== null} onClick={() => generate("rules")}>{busy === "rules" ? "만드는 중…" : "기본 초안 만들기 (AI 없이)"}</Button>
          </div>
        )}
        {!aiAvailable && <p className="text-sm text-amber-800">AI 키가 없어 AI 초안은 쓸 수 없습니다. 기본 초안은 역량 목록의 측정지표 문구를 템플릿 데이터에 연결해 만듭니다.</p>}
      </Card>

      <Card className="overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600"><tr><th className="px-4 py-2">이름</th><th className="px-4 py-2">상태</th><th className="px-4 py-2">역량 수</th><th className="px-4 py-2">출처</th><th className="px-4 py-2">마지막 수정</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">아직 채점기준표가 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2"><Link href={`/rubrics/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.name}</Link></td>
                <td className="px-4 py-2">{r.status === "confirmed" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">확정 {r.version}</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">초안</span>}</td>
                <td className="px-4 py-2">{r.competencies}</td>
                <td className="px-4 py-2 text-slate-600">{ORIGIN[r.generatedBy]}</td>
                <td className="px-4 py-2 text-slate-500">{formatTime(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
