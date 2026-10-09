"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LIST_COLUMNS, LIST_COLUMN_LABEL, parseManualList, type ColumnMapping, type CompetencyInput } from "@/lib/competency/parse-list";
import { api, Badge, BottomBar, Button, Card, ErrorNote, formatTime, inputClass, LoadingOverlay, Modal, PageTitle, sendJson, wait } from "@/components/ui";

interface Parsed {
  fileName: string; sheets: string[]; sheet: string; headers: string[]; preview: string[][];
  mapping: ColumnMapping; competencies: CompetencyInput[]; mappingError: string | null;
}
interface SavedList { id: string; name: string; competencies: CompetencyInput[]; createdAt: string }

const DRAFT_STEPS = ["역량 목록을 읽고 있어요", "역량마다 평가 항목을 나누고 있어요", "근거 데이터를 연결하고 있어요", "점수 기준을 채우고 있어요"];

export default function CompetenciesPage() {
  const router = useRouter();
  const [source, setSource] = useState<File | "sample" | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedList[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ lists: SavedList[] }>("/api/lists").then((d) => setSaved(d.lists)).catch(setError);
  }, []);

  async function parse(src: File | "sample", sheet?: string, mapping?: ColumnMapping) {
    const form = new FormData();
    if (src === "sample") form.append("sample", "1"); else form.append("file", src);
    if (sheet) form.append("sheet", sheet);
    if (mapping) form.append("mapping", JSON.stringify(mapping));
    try {
      const data = await api<Parsed>("/api/lists/parse", { method: "POST", body: form });
      setSource(src); setParsed(data); setError(null); setManualOpen(false);
      if (!name) setName(data.fileName.replace(/\.(xlsx|csv)$/i, "").replace(/\s*\(\d+\)$/, ""));
    } catch (e) { setError(e); }
  }

  const competencies = parsed ? parsed.competencies : parseManualList(manual);
  const groups = [...new Set(competencies.map((c) => c.group))];
  const missingDescription = competencies.filter((c) => !c.description).length;
  const listName = name.trim() || "역량 목록";

  /** 목록을 저장하고 곧바로 평가기준표 초안을 만들어 편집 화면으로 넘어간다 */
  async function generate(listId?: string) {
    setBusy(true); setError(null);
    try {
      const id = listId ?? (await sendJson<{ id: string }>("/api/lists", { name: listName, competencies })).id;
      const [rubric] = await Promise.all([sendJson<{ id: string }>("/api/rubrics", { listId: id, mode: "ai" }), wait(3200)]);
      router.push(`/rubrics/${rubric.id}`);
    } catch (e) { setError(e); setBusy(false); }
  }
  function reset() { setParsed(null); setSource(null); setManual(""); setManualOpen(false); setName(""); }

  return (
    <div className="space-y-6">
      <PageTitle step={1} title={<>평가하고 싶은 역량을<br />알려 주세요</>}>역량 이름과 설명만 있으면 돼요. 세부 요소나 측정지표가 있으면 기준표가 더 정확해져요.</PageTitle>
      <ErrorNote error={error} />

      {competencies.length === 0 && !manualOpen && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="group animate-rise cursor-pointer rounded-3xl bg-white p-6 shadow-card transition hover:-translate-y-0.5">
            <span className="text-4xl">📂</span>
            <p className="mt-4 text-lg font-bold">파일 올리기</p>
            <p className="mt-1 text-sm text-sub">엑셀(.xlsx)이나 CSV</p>
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parse(f); e.target.value = ""; }} />
          </label>
          <button type="button" onClick={() => setManualOpen(true)} style={{ animationDelay: "60ms" }} className="animate-rise rounded-3xl bg-white p-6 text-left shadow-card transition hover:-translate-y-0.5">
            <span className="text-4xl">✏️</span>
            <p className="mt-4 text-lg font-bold">직접 입력하기</p>
            <p className="mt-1 text-sm text-sub">한 줄에 역량 하나씩</p>
          </button>
          <button type="button" onClick={() => parse("sample")} style={{ animationDelay: "120ms" }} className="animate-rise rounded-3xl bg-white p-6 text-left shadow-card transition hover:-translate-y-0.5">
            <span className="text-4xl">✨</span>
            <p className="mt-4 text-lg font-bold">샘플로 시작하기</p>
            <p className="mt-1 text-sm text-sub">예시 역량 19개로 둘러보기</p>
          </button>
        </div>
      )}

      {manualOpen && !parsed && (
        <Card className="animate-rise space-y-3 p-6">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold">직접 입력하기</p>
            <Button variant="ghost" size="sm" onClick={reset}>다른 방법으로</Button>
          </div>
          <textarea autoFocus value={manual} onChange={(e) => setManual(e.target.value)} rows={7} placeholder={"도전정신: 새로운 일을 주도적으로 시도한다\n리더십: 목표를 세우고 팀을 이끈다\n글로벌: 외국어로 소통하고 다른 문화를 이해한다"} className="w-full rounded-2xl bg-fill p-4 text-[16px] leading-relaxed outline-none placeholder:text-faint focus:bg-white focus:ring-2 focus:ring-brand" />
          <p className="text-sm text-mute">형식: <b className="font-semibold text-sub">역량명: 설명</b> · 더 자세히는 <b className="font-semibold text-sub">구분 | 역량명 | 설명 | 측정지표</b></p>
        </Card>
      )}

      {competencies.length > 0 && (
        <Card className="animate-rise overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-6">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="목록 이름" className="min-w-0 flex-1 rounded-lg bg-transparent text-xl font-bold outline-none placeholder:text-faint focus:bg-fill" />
            <Badge tone="blue">역량 {competencies.length}개</Badge>
            {parsed && <Button variant="ghost" size="sm" onClick={() => setMappingOpen(true)}>잘못 읽혔나요?</Button>}
            {parsed && <Button variant="ghost" size="sm" onClick={reset}>다시 선택</Button>}
          </div>
          {missingDescription > 0 && <p className="mx-6 mb-3 rounded-xl bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn">설명이 없는 역량이 {missingDescription}개 있어요. 설명이 있어야 기준표가 정확해져요.</p>}
          {groups.map((group) => (
            <div key={group}>
              {group && <p className="bg-soft px-6 py-2 text-xs font-bold text-mute">{group}</p>}
              <ul>
                {competencies.filter((c) => c.group === group).map((c, i) => (
                  <li key={i} className="flex gap-4 border-t border-fill px-6 py-4">
                    <span className="w-32 shrink-0 text-[16px] font-bold">{c.name}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-relaxed text-sub">{c.description || <span className="text-bad">설명 없음</span>}</p>
                      {c.elements.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.elements.map((e) => <Badge key={e.name}>{e.name}</Badge>)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {competencies.length === 0 && saved.length > 0 && (
        <Card className="animate-rise p-3">
          <p className="px-4 pb-1 pt-3 text-sm font-semibold text-mute">이전에 넣은 목록</p>
          {saved.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-2xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold">{l.name}</p>
                <p className="text-sm text-mute">역량 {l.competencies.length}개 · {formatTime(l.createdAt)}</p>
              </div>
              <Button variant="soft" size="sm" onClick={() => generate(l.id)}>기준표 만들기</Button>
            </div>
          ))}
        </Card>
      )}

      {competencies.length > 0 && (
        <BottomBar hint={<><b className="font-bold text-ink">역량 {competencies.length}개</b>로 평가기준표 초안을 만들어요</>}>
          <Button variant="primary" size="lg" disabled={busy || competencies.some((c) => !c.name)} onClick={() => generate()}>AI로 평가기준표 만들기</Button>
        </BottomBar>
      )}

      {parsed && source && (
        <Modal open={mappingOpen} onClose={() => setMappingOpen(false)} wide title="어느 열이 무엇인지 알려 주세요" subtitle={parsed.fileName} footer={<Button variant="primary" onClick={() => setMappingOpen(false)}>확인</Button>}>
          <div className="grid gap-3 sm:grid-cols-3">
            {parsed.sheets.length > 1 && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-sub">시트
                <select value={parsed.sheet} onChange={(e) => parse(source, e.target.value)} className={inputClass}>{parsed.sheets.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
            )}
            {LIST_COLUMNS.map((column) => (
              <label key={column} className="flex flex-col gap-1.5 text-sm font-semibold text-sub">{LIST_COLUMN_LABEL[column]}
                <select
                  value={parsed.mapping[column] ?? ""}
                  onChange={(e) => {
                    const mapping = { ...parsed.mapping };
                    if (e.target.value === "") delete mapping[column]; else mapping[column] = Number(e.target.value);
                    parse(source, parsed.sheet, mapping);
                  }}
                  className={inputClass}
                >
                  <option value="">사용 안 함</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {parsed.mappingError && <p className="mt-3 text-sm font-medium text-bad">{parsed.mappingError}</p>}
          <p className="mb-2 mt-6 text-sm font-semibold text-mute">파일의 처음 5행</p>
          <div className="overflow-x-auto rounded-2xl bg-soft p-3">
            <table className="min-w-full text-left text-xs text-sub">
              <thead><tr>{parsed.headers.map((h, i) => <th key={i} className="px-2 py-1.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>{parsed.preview.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i} className="max-w-44 truncate border-t border-line px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Modal>
      )}

      <LoadingOverlay open={busy} title="평가기준표를 만들고 있어요" steps={DRAFT_STEPS} />
    </div>
  );
}
