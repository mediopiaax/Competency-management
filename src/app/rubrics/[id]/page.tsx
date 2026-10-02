"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, Button, Card, ErrorNote, formatTime, sendJson } from "@/components/ui";
import { evaluateStudent } from "@/lib/rubric/engine";
import { fieldLabel, findField, selectableFields } from "@/lib/rubric/fields";
import { DEFAULT_LEVELS, DEFAULT_UNDECIDABLE, presetFor } from "@/lib/rubric/presets";
import { AGGREGATE_LABEL, METHOD_LABEL, type Band, type Competency, type Item, type Rubric, type ScoreOption, type Source } from "@/lib/rubric/types";
import { validateRubric, type RubricIssue } from "@/lib/rubric/validate";
import type { ParsedStudent } from "@/lib/template/parse";

interface RecordMeta { id: string; name: string; status: "draft" | "confirmed"; version: string | null; updatedAt: string }
interface VersionRow { id: string; status: string; version: string | null; updatedAt: string }
type Mutate = (change: (draft: Rubric) => void) => void;

const input = "rounded border border-slate-300 px-1.5 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500";
const uid = () => Math.random().toString(36).slice(2, 10);

function Num({ value, onChange, disabled, className = "w-16" }: { value: number; onChange: (v: number) => void; disabled?: boolean; className?: string }) {
  return <input type="number" step="any" disabled={disabled} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className={`${input} ${className} text-right tabular-nums`} />;
}

function BandsEditor({ bands, onChange, disabled }: { bands: Band[]; onChange: (b: Band[]) => void; disabled: boolean }) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return (
    <div className="space-y-1">
      {sorted.map((band, i) => (
        <div key={i} className="flex items-center gap-1.5 text-sm">
          <Num disabled={disabled} value={band.min} onChange={(v) => onChange(sorted.map((b, k) => (k === i ? { ...b, min: v } : b)))} />
          <span className="text-slate-500">이상{i > 0 ? ` ${sorted[i - 1].min} 미만` : ""} →</span>
          <Num disabled={disabled} value={band.score} onChange={(v) => onChange(sorted.map((b, k) => (k === i ? { ...b, score: v } : b)))} />
          <span className="text-slate-500">점</span>
          {!disabled && <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={() => onChange(sorted.filter((_, k) => k !== i))}>삭제</button>}
        </div>
      ))}
      {!disabled && <button type="button" className="text-xs font-medium text-blue-700" onClick={() => onChange([...sorted, { min: 0, score: 0 }])}>+ 구간 추가</button>}
    </div>
  );
}

function OptionsEditor({ options, onChange, disabled, known }: { options: ScoreOption[]; onChange: (o: ScoreOption[]) => void; disabled: boolean; known?: string[] }) {
  const missing = (known ?? []).filter((k) => !options.some((o) => o.value === k));
  return (
    <div className="space-y-1">
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-1.5 text-sm">
          <input disabled={disabled} value={option.value} onChange={(e) => onChange(options.map((o, k) => (k === i ? { ...o, value: e.target.value } : o)))} className={`${input} w-32`} />
          <span className="text-slate-500">→</span>
          <Num disabled={disabled} value={option.score} onChange={(v) => onChange(options.map((o, k) => (k === i ? { ...o, score: v } : o)))} />
          <span className="text-slate-500">점</span>
          {!disabled && <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={() => onChange(options.filter((_, k) => k !== i))}>삭제</button>}
        </div>
      ))}
      {!disabled && (
        <div className="flex gap-3">
          <button type="button" className="text-xs font-medium text-blue-700" onClick={() => onChange([...options, { value: "", score: 0 }])}>+ 선택지 추가</button>
          {missing.length > 0 && <button type="button" className="text-xs font-medium text-blue-700" onClick={() => onChange([...options, ...missing.map((value) => ({ value, score: 0 }))])}>빠진 선택지 {missing.length}개 채우기(0점)</button>}
        </div>
      )}
    </div>
  );
}

function ruleSummary(source: Source): string {
  if (source.method === "range") return [...source.bands].sort((a, b) => b.min - a.min).map((b) => `${b.min} 이상 ${b.score}점`).join(" / ");
  if (source.method === "choice") return source.options.map((o) => `${o.value} ${o.score}점`).join(" / ");
  if (source.method === "language") return "아래 어학 환산표로 0~100점 환산, 여러 건이면 최고값";
  return source.levels.map((l) => `${l.level}: ${l.criterion}`).join(" / ");
}

function SourceEditor({ source, onChange, onRemove, disabled }: { source: Source; onChange: (s: Source) => void; onRemove: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = findField(source.fieldId);
  const groups = useMemo(() => {
    const map = new Map<string, typeof selectableFields>();
    for (const f of selectableFields) map.set(f.category.label, [...(map.get(f.category.label) ?? []), f]);
    return [...map.entries()];
  }, []);
  const filterable = ref?.inTable ? (ref.category.table?.columns.filter((c) => c.options && c.id !== source.fieldId) ?? []) : [];
  const filterField = source.filter ? findField(source.filter.fieldId)?.field : undefined;
  const set = (patch: Partial<Source>) => onChange({ ...source, ...patch });

  function changeField(fieldId: string) {
    const preset = presetFor(fieldId);
    if (preset) return onChange({ ...preset, id: source.id });
    const target = findField(fieldId)!;
    const narrative = target.field.type === "text" || target.field.type === "narrative";
    onChange({
      ...source, fieldId, filter: null, multiplier: null, perSemester: false, aggregate: "max", bonusPerExtra: 0,
      method: narrative ? "narrative" : target.field.options ? "choice" : "range",
      bands: narrative || target.field.options ? [] : [{ min: 0, score: 0 }],
      options: target.field.options && !narrative ? target.field.options.map((value) => ({ value, score: 0 })) : [],
      levels: narrative ? structuredClone(DEFAULT_LEVELS) : [],
      undecidable: narrative ? DEFAULT_UNDECIDABLE : "",
    });
  }
  function changeMethod(method: Source["method"]) {
    set({
      method,
      levels: method === "narrative" && source.levels.length === 0 ? structuredClone(DEFAULT_LEVELS) : source.levels,
      undecidable: method === "narrative" && !source.undecidable ? DEFAULT_UNDECIDABLE : source.undecidable,
      bands: method === "range" && source.bands.length === 0 ? [{ min: 0, score: 0 }] : source.bands,
      aggregate: method === "range" && source.aggregate === "maxPlus" ? "max" : source.aggregate,
    });
  }
  const aggregates: Source["aggregate"][] = source.method === "range" ? ["max", "avg", "sum", "count"] : ["max", "avg", "maxPlus"];

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">
      <button type="button" className="block w-full text-left" onClick={() => setOpen(!open)}>
        <span className="font-medium">{fieldLabel(source.fieldId)}</span>
        <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">{METHOD_LABEL[source.method]}</span>
        {ref?.inTable && source.method !== "language" && source.method !== "narrative" && <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">{AGGREGATE_LABEL[source.aggregate]}</span>}
        {source.perSemester && <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">학기당 환산</span>}
        {source.filter && <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">{filterField?.label} = {source.filter.values.join("/")}</span>}
        <span className="mt-1 block text-xs text-slate-500">{ruleSummary(source)}</span>
        <span className="text-xs text-blue-700">{open ? "접기" : disabled ? "자세히" : "수정"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3 border-t border-slate-200 pt-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">근거 데이터
              <select disabled={disabled} value={source.fieldId} onChange={(e) => changeField(e.target.value)} className={`${input} max-w-72`}>
                {!ref && <option value={source.fieldId}>(템플릿에 없는 데이터)</option>}
                {groups.map(([label, fields]) => (
                  <optgroup key={label} label={label}>{fields.map((f) => <option key={f.field.id} value={f.field.id}>{f.field.label}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">평가 방식
              <select disabled={disabled} value={source.method} onChange={(e) => changeMethod(e.target.value as Source["method"])} className={input}>
                {(Object.keys(METHOD_LABEL) as Source["method"][]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </label>
            {ref?.inTable && (source.method === "range" || source.method === "choice") && (
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">여러 건일 때
                <select disabled={disabled} value={source.aggregate} onChange={(e) => set({ aggregate: e.target.value as Source["aggregate"] })} className={input}>
                  {aggregates.map((a) => <option key={a} value={a}>{AGGREGATE_LABEL[a]}</option>)}
                </select>
              </label>
            )}
            {source.aggregate === "maxPlus" && source.method === "choice" && (
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">추가 건당 가산(점)
                <Num disabled={disabled} value={source.bonusPerExtra} onChange={(v) => set({ bonusPerExtra: v })} />
              </label>
            )}
            {source.method === "range" && (
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={disabled} checked={source.perSemester} onChange={(e) => set({ perSemester: e.target.checked })} />이수 학기 수로 나눠 학기당 값으로 보기</label>
            )}
          </div>

          {filterable.length > 0 && source.method !== "language" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              일부 내역만 보기
              <select disabled={disabled} value={source.filter?.fieldId ?? ""} onChange={(e) => set({ filter: e.target.value ? { fieldId: e.target.value, values: [] } : null })} className={input}>
                <option value="">전체 내역</option>
                {filterable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {source.filter && filterField?.options?.map((value) => (
                <label key={value} className="flex items-center gap-1 text-sm text-slate-700">
                  <input type="checkbox" disabled={disabled} checked={source.filter!.values.includes(value)} onChange={(e) => set({ filter: { fieldId: source.filter!.fieldId, values: e.target.checked ? [...source.filter!.values, value] : source.filter!.values.filter((v) => v !== value) } })} />
                  {value}
                </label>
              ))}
            </div>
          )}

          {source.method === "range" && <BandsEditor disabled={disabled} bands={source.bands} onChange={(bands) => set({ bands })} />}
          {source.method === "choice" && <OptionsEditor disabled={disabled} options={source.options} known={ref?.field.options} onChange={(options) => set({ options })} />}
          {source.method === "choice" && source.multiplier && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">{findField(source.multiplier.fieldId)?.field.label} 계수 (선택지 점수에 곱함)</p>
              {source.multiplier.factors.map((f, i) => (
                <div key={f.value} className="flex items-center gap-1.5">
                  <span className="w-16">{f.value}</span>×
                  <Num disabled={disabled} value={f.factor} onChange={(v) => set({ multiplier: { ...source.multiplier!, factors: source.multiplier!.factors.map((x, k) => (k === i ? { ...x, factor: v } : x)) } })} />
                </div>
              ))}
              {!disabled && <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={() => set({ multiplier: null })}>계수 쓰지 않기</button>}
            </div>
          )}
          {source.method === "language" && <p className="text-xs text-slate-500">시험별 환산 기준은 화면 아래 &apos;어학 공통 척도 환산표&apos;에서 고칩니다.</p>}
          {source.method === "narrative" && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">레벨 기준문은 관찰 가능한 사실로 씁니다. 레벨 1~5는 20/40/60/80/100점입니다.</p>
              {[1, 2, 3, 4, 5].map((level) => (
                <div key={level} className="flex items-start gap-1.5">
                  <span className="mt-1 w-12 shrink-0 text-xs text-slate-500">레벨 {level}</span>
                  <textarea disabled={disabled} rows={1} value={source.levels.find((l) => l.level === level)?.criterion ?? ""} onChange={(e) => set({ levels: [1, 2, 3, 4, 5].map((l) => ({ level: l, criterion: l === level ? e.target.value : (source.levels.find((x) => x.level === l)?.criterion ?? "") })) })} className={`${input} w-full`} />
                </div>
              ))}
              <div className="flex items-start gap-1.5">
                <span className="mt-1 w-12 shrink-0 text-xs text-slate-500">판단 불가</span>
                <textarea disabled={disabled} rows={1} value={source.undecidable} onChange={(e) => set({ undecidable: e.target.value })} className={`${input} w-full`} />
              </div>
            </div>
          )}
          {!disabled && <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={onRemove}>이 근거 삭제</button>}
        </div>
      )}
    </div>
  );
}

function newSource(): Source {
  const fieldId = selectableFields[0].field.id;
  return { ...presetFor(fieldId)!, id: `s-${uid()}` };
}

function CompetencyCard({ competency, index, mutate, issues, disabled }: { competency: Competency; index: number; mutate: Mutate; issues: RubricIssue[]; disabled: boolean }) {
  const edit = (change: (c: Competency) => void) => mutate((r) => change(r.competencies[index]));
  const editItem = (i: number, change: (item: Item) => void) => edit((c) => change(c.items[i]));
  const basicTotal = competency.items.filter((i) => i.kind === "basic").reduce((acc, i) => acc + i.weight, 0);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warn");

  return (
    <Card className="overflow-hidden">
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {competency.group && <span className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500">{competency.group}</span>}
          <h3 className="text-lg font-semibold">{competency.name}</h3>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">측정 가능성 <span className="rounded bg-violet-100 px-1 text-violet-800">제안</span>
            <select disabled={disabled} value={competency.measurability} onChange={(e) => edit((c) => { c.measurability = e.target.value as Competency["measurability"]; })} className={input}>
              <option>상</option><option>중</option><option>하</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-slate-600">{competency.description}</p>
        {(competency.note || !disabled) && (
          <textarea disabled={disabled} rows={1} value={competency.note} placeholder="측정하기 어려운 부분, 필요한 추가 데이터 메모" onChange={(e) => edit((c) => { c.note = e.target.value; })} className={`${input} w-full bg-white`} />
        )}
        {errors.map((i, k) => <p key={`e${k}`} className="text-sm text-red-700">오류: {i.message.replace(/^\[[^\]]*\]\s*/, "")}</p>)}
        {warnings.map((i, k) => <p key={`w${k}`} className="text-sm text-amber-700">주의: {i.message.replace(/^\[[^\]]*\]\s*/, "")}</p>)}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr><th className="w-44 px-3 py-2">평가 항목</th><th className="w-52 px-3 py-2">무엇을 보나</th><th className="px-3 py-2">근거 데이터와 점수 기준</th><th className="w-24 px-3 py-2">비중</th><th className="w-28 px-3 py-2">유형</th></tr>
          </thead>
          <tbody>
            {competency.items.map((item, i) => (
              <tr key={item.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <input disabled={disabled} value={item.name} onChange={(e) => editItem(i, (x) => { x.name = e.target.value; })} className={`${input} w-full font-medium`} />
                  {!disabled && <button type="button" className="mt-1 text-xs text-slate-400 hover:text-red-700" onClick={() => edit((c) => { c.items.splice(i, 1); })}>항목 삭제</button>}
                </td>
                <td className="px-3 py-2"><textarea disabled={disabled} rows={2} value={item.description} onChange={(e) => editItem(i, (x) => { x.description = e.target.value; })} className={`${input} w-full`} /></td>
                <td className="space-y-1.5 px-3 py-2">
                  {item.sources.map((source, k) => (
                    <SourceEditor key={source.id} disabled={disabled} source={source} onChange={(s) => editItem(i, (x) => { x.sources[k] = s; })} onRemove={() => editItem(i, (x) => { x.sources.splice(k, 1); })} />
                  ))}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {!disabled && <button type="button" className="font-medium text-blue-700" onClick={() => editItem(i, (x) => { x.sources.push(newSource()); })}>+ 근거 추가</button>}
                    {item.sources.length > 1 && (
                      <label className="flex items-center gap-1 text-slate-500">근거가 여러 개면
                        <select disabled={disabled} value={item.combine} onChange={(e) => editItem(i, (x) => { x.combine = e.target.value as Item["combine"]; })} className={input}>
                          <option value="max">가장 높은 근거로</option><option value="avg">있는 근거의 평균으로</option>
                        </select>
                      </label>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2"><div className="flex items-center gap-1"><Num disabled={disabled} value={item.weight} onChange={(v) => editItem(i, (x) => { x.weight = v; })} className="w-14" /><span className="text-slate-500">{item.kind === "bonus" ? "점" : "%"}</span></div></td>
                <td className="px-3 py-2">
                  <select disabled={disabled} value={item.kind} onChange={(e) => editItem(i, (x) => { x.kind = e.target.value as Item["kind"]; })} className={input}>
                    <option value="basic">기본형</option><option value="bonus">가점형</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">{item.kind === "bonus" ? "있으면 최대 그만큼 가점, 없어도 감점 없음" : "없으면 0점"}</p>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-sm">
              <td colSpan={3} className="px-3 py-2">{!disabled && <button type="button" className="text-sm font-medium text-blue-700" onClick={() => edit((c) => { c.items.push({ id: `i-${uid()}`, name: "새 평가 항목", description: "", weight: 0, kind: "basic", combine: "max", sources: [newSource()] }); })}>+ 평가 항목 추가</button>}</td>
              <td colSpan={2} className={`px-3 py-2 font-medium ${Math.abs(basicTotal - 100) > 0.01 && competency.items.length > 0 ? "text-red-700" : "text-slate-600"}`}>기본형 합계 {Math.round(basicTotal * 100) / 100}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

const BANNER: { label: string; codes: string[] }[] = [
  { label: "비중 합계 100", codes: ["WEIGHT_SUM"] },
  { label: "구간표·선택지 빈틈", codes: ["BAND_GAP", "CHOICE_GAP", "NO_OPTIONS", "GRADE_GAP", "LEVELS"] },
  { label: "단일 근거 항목", codes: ["SINGLE_SOURCE"] },
  { label: "중복 가산 의심", codes: ["DUPLICATE_EVIDENCE"] },
  { label: "자기보고식 데이터", codes: ["EXCLUDED_FIELD"] },
  { label: "서술 판정 비중", codes: ["QUAL_WEIGHT"] },
];

export default function RubricEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meta, setMeta] = useState<RecordMeta | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [dirty, setDirty] = useState(false);
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);

  useEffect(() => {
    api<{ record: RecordMeta & { body: Rubric }; versions: VersionRow[] }>(`/api/rubrics/${id}`)
      .then((d) => { setMeta(d.record); setRubric(d.record.body); setVersions(d.versions); setDirty(false); })
      .catch(setError);
    api<{ submissions: { student: ParsedStudent }[] }>("/api/submissions").then((d) => setStudents(d.submissions.map((s) => s.student).filter((s) => s.evaluable))).catch(() => undefined);
  }, [id]);

  const issues = useMemo(() => (rubric ? validateRubric(rubric) : []), [rubric]);
  const preview = useMemo(() => (rubric ? students.map((s) => ({ name: s.name ?? s.sheetName, result: evaluateStudent(rubric, s) })) : []), [rubric, students]);

  if (!rubric || !meta) return error ? <ErrorNote error={error} /> : <p className="text-slate-500">불러오는 중…</p>;
  const disabled = meta.status === "confirmed";
  const errorCount = issues.filter((i) => i.level === "error").length;
  const mutate: Mutate = (change) => { const next = structuredClone(rubric); change(next); setRubric(next); setDirty(true); setNotice(null); };

  async function save(): Promise<boolean> {
    try {
      await sendJson(`/api/rubrics/${id}`, { body: rubric }, "PUT");
      setDirty(false); setError(null); setNotice("저장했습니다.");
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? new Error("오류가 있어 저장하지 않았습니다. 아래 빨간 항목을 고치세요.") : e);
      return false;
    }
  }
  async function confirm() {
    if (!window.confirm("확정하면 이 버전은 잠기고 더 고칠 수 없습니다. 이후 수정은 새 버전으로만 할 수 있습니다. 확정할까요?")) return;
    if (dirty && !(await save())) return;
    try {
      const { version } = await sendJson<{ version: string }>(`/api/rubrics/${id}`, { action: "confirm" });
      setMeta({ ...meta!, status: "confirmed", version }); setNotice(`${version}으로 확정했습니다.`);
    } catch (e) { setError(e); }
  }
  async function fork() {
    try {
      const { id: next } = await sendJson<{ id: string }>(`/api/rubrics/${id}`, { action: "fork" });
      router.push(`/rubrics/${next}`);
    } catch (e) { setError(e); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rubric, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${rubric!.name}${meta!.version ? `-${meta!.version}` : ""}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input disabled={disabled} value={rubric.name} onChange={(e) => mutate((r) => { r.name = e.target.value; })} className="min-w-64 flex-1 rounded border border-transparent bg-transparent px-1 text-2xl font-semibold hover:border-slate-300 disabled:hover:border-transparent" />
        {disabled ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm text-emerald-800">확정 {meta.version} · 잠김</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm text-amber-800">초안{dirty ? " · 저장 안 됨" : ""}</span>}
      </div>
      <p className="text-sm text-slate-600">
        {rubric.generatedBy === "ai" ? "AI가 만든 초안입니다." : rubric.generatedBy === "rules" ? "AI 없이 규칙으로 만든 기본 초안입니다." : "직접 수정한 기준표입니다."}{" "}
        역량명과 설명은 기관이 준 원문 그대로이고, 평가 항목·근거·점수 기준·비중은 제안이므로 확인하고 고치세요. 근거를 누르면 점수 기준을 고칠 수 있습니다.
      </p>

      <div className="sticky top-0 z-10 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {BANNER.map((b) => {
            const hits = issues.filter((i) => b.codes.includes(i.code));
            const bad = hits.some((i) => i.level === "error");
            return <span key={b.label} className={`rounded-full px-2 py-0.5 text-xs ${hits.length === 0 ? "bg-emerald-100 text-emerald-800" : bad ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{b.label} {hits.length === 0 ? "✓" : `${hits.length}건`}</span>;
          })}
          <button type="button" className="text-xs font-medium text-blue-700" onClick={() => setShowIssues(!showIssues)}>{showIssues ? "목록 접기" : `전체 ${issues.length}건 보기`}</button>
          <span className="ml-auto flex flex-wrap gap-2">
            <Button onClick={download}>JSON 내보내기</Button>
            {disabled ? (
              <><Button onClick={fork}>새 버전으로 수정</Button><Link href="/evaluate" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">이 버전으로 평가하기</Link></>
            ) : (
              <><Button disabled={!dirty || errorCount > 0} onClick={save}>저장</Button><Button variant="primary" disabled={errorCount > 0} onClick={confirm}>확정</Button></>
            )}
          </span>
        </div>
        {errorCount > 0 && !disabled && <p className="text-sm text-red-700">오류 {errorCount}건이 있어 저장·확정할 수 없습니다.</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {error != null && <ErrorNote error={error} />}
        {showIssues && (
          <ul className="max-h-48 space-y-0.5 overflow-y-auto border-t border-slate-100 pt-2 text-sm">
            {issues.length === 0 && <li className="text-slate-500">문제가 없습니다.</li>}
            {issues.map((i, k) => <li key={k} className={i.level === "error" ? "text-red-700" : "text-amber-700"}>{i.level === "error" ? "오류" : "주의"}: {i.message}</li>)}
          </ul>
        )}
      </div>

      {preview.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 font-semibold">미리보기 채점</h2>
          <p className="mb-2 text-xs text-slate-500">저장된 학생 데이터를 지금 화면의 기준으로 바로 채점한 결과입니다. 기준을 고치면 즉시 바뀝니다. 서술 판정 항목은 여기서는 빠집니다.</p>
          <div className="overflow-x-auto">
            <table className="text-left text-xs">
              <thead><tr><th className="px-2 py-1" />{rubric.competencies.map((c) => <th key={c.id} className="max-w-20 px-2 py-1 font-medium text-slate-600" title={`${c.group} ${c.name}`}><span className="block truncate">{c.name}</span></th>)}</tr></thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-2 py-1 font-medium">{p.name}</td>
                    {p.result.competencies.map((c) => <td key={c.competencyId} className="px-2 py-1 text-center tabular-nums" title={`충족도 ${c.coverage}%`}>{c.hold ? <span className="text-slate-400">보류</span> : `${c.score} ${c.grade}`}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {rubric.competencies.map((competency, index) => (
        <CompetencyCard key={competency.id} competency={competency} index={index} mutate={mutate} disabled={disabled} issues={issues.filter((i) => i.competencyId === competency.id)} />
      ))}

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">어학 공통 척도 환산표</h2>
        <p className="text-sm text-amber-800">이 환산표는 근거 없는 가정으로 채운 기본값입니다. 기관의 기준에 맞게 반드시 검토하고 고치세요.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rubric.languageTable.map((entry, i) => (
            <div key={entry.exam} className="rounded border border-slate-200 p-3">
              <p className="mb-2 font-medium">{entry.exam} <span className="text-xs font-normal text-slate-500">({entry.basis === "score" ? "점수 기준" : "등급 기준"})</span></p>
              {entry.basis === "score"
                ? <BandsEditor disabled={disabled} bands={entry.bands} onChange={(bands) => mutate((r) => { r.languageTable[i].bands = bands; })} />
                : <OptionsEditor disabled={disabled} options={entry.options} onChange={(options) => mutate((r) => { r.languageTable[i].options = options; })} />}
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">등급·판정 규칙</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {[...rubric.settings.grades].sort((a, b) => b.min - a.min).map((g) => {
            const index = rubric.settings.grades.indexOf(g);
            return <label key={index} className="flex items-center gap-1"><input disabled={disabled} value={g.grade} onChange={(e) => mutate((r) => { r.settings.grades[index].grade = e.target.value; })} className={`${input} w-10 text-center font-medium`} /><Num disabled={disabled} value={g.min} onChange={(v) => mutate((r) => { r.settings.grades[index].min = v; })} className="w-14" />점 이상</label>;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-1">데이터 충족도 <Num disabled={disabled} value={rubric.settings.holdThreshold} onChange={(v) => mutate((r) => { r.settings.holdThreshold = v; })} className="w-14" />% 미만이면 판정 보류</label>
          <label className="flex items-center gap-1">서술 판정 비중 상한 <Num disabled={disabled} value={rubric.settings.qualWeightCap} onChange={(v) => mutate((r) => { r.settings.qualWeightCap = v; })} className="w-14" />%</label>
          <label className="flex items-center gap-1">서술 판정 변동폭 ±<Num disabled={disabled} value={rubric.settings.qualSwing} onChange={(v) => mutate((r) => { r.settings.qualSwing = v; })} className="w-14" />점</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" disabled={disabled} checked={rubric.settings.excludeExpired} onChange={(e) => mutate((r) => { r.settings.excludeExpired = e.target.checked; })} />만료된 성적 제외</label>
        </div>
      </Card>

      {versions.length > 1 && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold">버전</h2>
          <ul className="space-y-1 text-sm">
            {versions.map((v) => <li key={v.id}>{v.id === id ? <span className="font-medium">{v.version ?? "초안"} (지금 보는 버전)</span> : <Link href={`/rubrics/${v.id}`} className="text-blue-700 hover:underline">{v.version ?? "초안"}</Link>} <span className="text-slate-400">{formatTime(v.updatedAt)}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
