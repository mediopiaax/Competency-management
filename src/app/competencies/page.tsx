"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIST_COLUMNS, LIST_COLUMN_LABEL, parseManualList, type ColumnMapping, type CompetencyInput } from "@/lib/competency/parse-list";
import { api, Button, Card, ErrorNote, formatTime, PageTitle, sendJson } from "@/components/ui";

interface Parsed {
  fileName: string; sheets: string[]; sheet: string; headers: string[]; preview: string[][];
  mapping: ColumnMapping; competencies: CompetencyInput[]; mappingError: string | null;
}
interface SavedList { id: string; name: string; competencies: CompetencyInput[]; createdAt: string }

export default function CompetenciesPage() {
  const [source, setSource] = useState<File | "sample" | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [manual, setManual] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedList[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [justSaved, setJustSaved] = useState(false);

  const refresh = () => api<{ lists: SavedList[] }>("/api/lists").then((d) => setSaved(d.lists)).catch(setError);
  useEffect(() => { refresh(); }, []);

  async function parse(src: File | "sample", sheet?: string, mapping?: ColumnMapping) {
    const form = new FormData();
    if (src === "sample") form.append("sample", "1"); else form.append("file", src);
    if (sheet) form.append("sheet", sheet);
    if (mapping) form.append("mapping", JSON.stringify(mapping));
    try {
      const data = await api<Parsed>("/api/lists/parse", { method: "POST", body: form });
      setSource(src); setParsed(data); setError(null); setJustSaved(false);
      if (!name) setName(data.fileName.replace(/\.(xlsx|csv)$/i, ""));
    } catch (e) { setError(e); }
  }

  const manualList = parseManualList(manual);
  const competencies = parsed ? parsed.competencies : manualList;

  async function save() {
    try {
      await sendJson("/api/lists", { name, competencies });
      setParsed(null); setSource(null); setManual(""); setName(""); setJustSaved(true); setError(null);
      refresh();
    } catch (e) { setError(e); }
  }

  return (
    <div className="space-y-8">
      <PageTitle title="1. 역량 목록">
        기관의 인재상이나 역량 목록을 올립니다. 역량명과 설명은 꼭 있어야 하고, 구분·세부 요소·측정지표는 있으면 초안이 더 정확해집니다.
      </PageTitle>
      <ErrorNote error={error} />
      {justSaved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          저장했습니다. <Link href="/rubrics" className="font-medium underline">채점기준표 초안 만들러 가기</Link>
        </p>
      )}

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            엑셀·CSV 파일 선택
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
          </label>
          <Button onClick={() => parse("sample")}>샘플 역량 목록으로 보기</Button>
        </div>
        {!parsed && (
          <div>
            <p className="mb-1 text-sm text-slate-600">또는 직접 입력 — 한 줄에 하나씩 <code className="rounded bg-slate-100 px-1">역량명: 설명</code> 또는 <code className="rounded bg-slate-100 px-1">구분 | 역량명 | 설명 | 측정지표</code></p>
            <textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={5} placeholder={"도전정신: 새로운 일을 주도적으로 시도한다\n기업 | 글로벌 | 외국어로 업무를 수행한다 | 어학 자격증, 교환학생"} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
          </div>
        )}
      </Card>

      {parsed && source && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">열 매핑 — {parsed.fileName}</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {parsed.sheets.length > 1 && (
              <label className="flex flex-col gap-1">시트
                <select value={parsed.sheet} onChange={(e) => parse(source, e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">
                  {parsed.sheets.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
            {LIST_COLUMNS.map((column) => (
              <label key={column} className="flex flex-col gap-1">{LIST_COLUMN_LABEL[column]}
                <select
                  value={parsed.mapping[column] ?? ""}
                  onChange={(e) => {
                    const mapping = { ...parsed.mapping };
                    if (e.target.value === "") delete mapping[column]; else mapping[column] = Number(e.target.value);
                    parse(source, parsed.sheet, mapping);
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                >
                  <option value="">사용 안 함</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {parsed.mappingError && <p className="text-sm text-red-700">{parsed.mappingError}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-600">
              <thead><tr>{parsed.headers.map((h, i) => <th key={i} className="border-b border-slate-200 px-2 py-1 font-medium">{h}</th>)}</tr></thead>
              <tbody>{parsed.preview.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i} className="max-w-48 truncate border-b border-slate-100 px-2 py-1">{c}</td>)}</tr>)}</tbody>
            </table>
            <p className="mt-1 text-xs text-slate-400">파일의 처음 5행입니다. 병합된 칸은 위 행의 값을 이어받습니다.</p>
          </div>
        </Card>
      )}

      {competencies.length > 0 && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">읽은 역량 {competencies.length}개</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="px-2 py-1">구분</th><th className="px-2 py-1">역량명</th><th className="px-2 py-1">설명</th><th className="px-2 py-1">세부 요소</th></tr></thead>
              <tbody>
                {competencies.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{c.group}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium">{c.name}</td>
                    <td className="px-2 py-1.5">{c.description || <span className="text-red-700">설명 없음</span>}</td>
                    <td className="px-2 py-1.5 text-slate-600">{c.elements.map((e) => e.name).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="목록 이름" className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <Button variant="primary" disabled={name.trim() === ""} onClick={save}>이 목록 저장</Button>
          </div>
        </Card>
      )}

      {saved.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">저장된 역량 목록</h2>
          <ul className="space-y-1 text-sm">
            {saved.map((l) => <li key={l.id} className="flex gap-3"><span className="font-medium">{l.name}</span><span className="text-slate-500">역량 {l.competencies.length}개</span><span className="ml-auto text-slate-400">{formatTime(l.createdAt)}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
