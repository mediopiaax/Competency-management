"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { heatColor } from "@/components/charts";
import { api, ApiError, Badge, BottomBar, Button, buttonClass, Card, ErrorNote, formatTime, Modal, Segmented, sendJson, StepBack } from "@/components/ui";
import { evaluateStudent } from "@/lib/rubric/engine";
import { fieldLabel, findField, selectableFields } from "@/lib/rubric/fields";
import { DEFAULT_LEVELS, DEFAULT_UNDECIDABLE, presetFor } from "@/lib/rubric/presets";
import { AGGREGATE_LABEL, METHOD_LABEL, type Band, type Competency, type Item, type Rubric, type ScoreOption, type Source } from "@/lib/rubric/types";
import { validateRubric, type RubricIssue } from "@/lib/rubric/validate";
import type { ParsedStudent } from "@/lib/template/parse";

interface RecordMeta { id: string; name: string; status: "draft" | "confirmed"; version: string | null; updatedAt: string }
interface VersionRow { id: string; status: string; version: string | null; updatedAt: string }
type Mutate = (change: (draft: Rubric) => void) => void;

const field = "h-10 rounded-[10px] border border-transparent bg-fill px-3 text-[15px] outline-none transition focus:border-brand focus:bg-white disabled:text-mute";
const area = "w-full rounded-[10px] border border-transparent bg-fill px-3 py-2.5 text-[15px] leading-relaxed outline-none transition focus:border-brand focus:bg-white disabled:text-mute";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold text-mute";
const textLink = "text-sm font-semibold text-brand hover:underline";
const uid = () => Math.random().toString(36).slice(2, 10);
const plain = (message: string) => message.replace(/^\[[^\]]*\]\s*/, "");

function Num({ value, onChange, disabled, className = "w-20" }: { value: number; onChange: (v: number) => void; disabled?: boolean; className?: string }) {
  return <input type="number" step="any" disabled={disabled} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className={`${field} ${className} text-right font-semibold tabular-nums`} />;
}
function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="삭제" className="flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-bad-soft hover:text-bad">✕</button>;
}

function BandsEditor({ bands, onChange, disabled }: { bands: Band[]; onChange: (b: Band[]) => void; disabled: boolean }) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return (
    <div className="space-y-1.5">
      {sorted.map((band, i) => (
        <div key={i} className="flex items-center gap-2 text-[15px]">
          <Num disabled={disabled} value={band.min} onChange={(v) => onChange(sorted.map((b, k) => (k === i ? { ...b, min: v } : b)))} />
          <span className="w-28 text-sub">이상{i > 0 ? ` ${sorted[i - 1].min} 미만` : ""}</span>
          <span className="text-faint">→</span>
          <Num disabled={disabled} value={band.score} onChange={(v) => onChange(sorted.map((b, k) => (k === i ? { ...b, score: v } : b)))} className="w-16" />
          <span className="text-sub">점</span>
          {!disabled && <RemoveButton onClick={() => onChange(sorted.filter((_, k) => k !== i))} />}
        </div>
      ))}
      {!disabled && <button type="button" className={textLink} onClick={() => onChange([...sorted, { min: 0, score: 0 }])}>+ 구간 추가</button>}
    </div>
  );
}

function OptionsEditor({ options, onChange, disabled, known }: { options: ScoreOption[]; onChange: (o: ScoreOption[]) => void; disabled: boolean; known?: string[] }) {
  const missing = (known ?? []).filter((k) => !options.some((o) => o.value === k));
  return (
    <div className="space-y-1.5">
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-2 text-[15px]">
          <input disabled={disabled} value={option.value} onChange={(e) => onChange(options.map((o, k) => (k === i ? { ...o, value: e.target.value } : o)))} className={`${field} w-40`} />
          <span className="text-faint">→</span>
          <Num disabled={disabled} value={option.score} onChange={(v) => onChange(options.map((o, k) => (k === i ? { ...o, score: v } : o)))} className="w-16" />
          <span className="text-sub">점</span>
          {!disabled && <RemoveButton onClick={() => onChange(options.filter((_, k) => k !== i))} />}
        </div>
      ))}
      {!disabled && (
        <div className="flex gap-4">
          <button type="button" className={textLink} onClick={() => onChange([...options, { value: "", score: 0 }])}>+ 선택지 추가</button>
          {missing.length > 0 && <button type="button" className={textLink} onClick={() => onChange([...options, ...missing.map((value) => ({ value, score: 0 }))])}>빠진 선택지 {missing.length}개 채우기(0점)</button>}
        </div>
      )}
    </div>
  );
}

function ruleSummary(source: Source): string {
  if (source.method === "range") return [...source.bands].sort((a, b) => b.min - a.min).map((b) => `${b.min}↑ ${b.score}점`).join("  ·  ");
  if (source.method === "choice") return source.options.map((o) => `${o.value} ${o.score}점`).join("  ·  ");
  if (source.method === "language") return "어학 환산표로 0~100점 환산, 여러 건이면 최고값";
  return "서술을 읽고 레벨 1~5로 판정 (20~100점)";
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
    <div className={`rounded-2xl border transition ${open ? "border-brand/40 bg-white" : "border-line bg-white"}`}>
      <button type="button" className="flex w-full items-start gap-3 px-4 py-3.5 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{fieldLabel(source.fieldId)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={source.method === "narrative" ? "violet" : "gray"}>{source.method === "narrative" ? "AI 서술 판정" : METHOD_LABEL[source.method]}</Badge>
            {ref?.inTable && source.method !== "language" && source.method !== "narrative" && <Badge>{AGGREGATE_LABEL[source.aggregate]}</Badge>}
            {source.perSemester && <Badge>학기당 환산</Badge>}
            {source.filter && <Badge>{filterField?.label} = {source.filter.values.join("/")}</Badge>}
          </div>
          {!open && <p className="mt-2 truncate text-sm text-mute">{ruleSummary(source)}</p>}
        </div>
        <span className="mt-0.5 shrink-0 text-sm font-semibold text-brand">{open ? "접기" : disabled ? "기준 보기" : "기준 수정"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>근거 데이터
              <select disabled={disabled} value={source.fieldId} onChange={(e) => changeField(e.target.value)} className={field}>
                {!ref && <option value={source.fieldId}>(템플릿에 없는 데이터)</option>}
                {groups.map(([groupLabel, fields]) => (
                  <optgroup key={groupLabel} label={groupLabel}>{fields.map((f) => <option key={f.field.id} value={f.field.id}>{f.field.label}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label className={label}>평가 방식
              <select disabled={disabled} value={source.method} onChange={(e) => changeMethod(e.target.value as Source["method"])} className={field}>
                {(Object.keys(METHOD_LABEL) as Source["method"][]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </label>
            {ref?.inTable && (source.method === "range" || source.method === "choice") && (
              <label className={label}>여러 건일 때
                <select disabled={disabled} value={source.aggregate} onChange={(e) => set({ aggregate: e.target.value as Source["aggregate"] })} className={field}>
                  {aggregates.map((a) => <option key={a} value={a}>{AGGREGATE_LABEL[a]}</option>)}
                </select>
              </label>
            )}
            {source.aggregate === "maxPlus" && source.method === "choice" && (
              <label className={label}>추가 건당 가산(점)
                <Num disabled={disabled} value={source.bonusPerExtra} onChange={(v) => set({ bonusPerExtra: v })} className="w-full" />
              </label>
            )}
          </div>
          {source.method === "range" && (
            <label className="flex items-center gap-2 text-[15px] text-sub"><input type="checkbox" className="h-4 w-4 accent-brand" disabled={disabled} checked={source.perSemester} onChange={(e) => set({ perSemester: e.target.checked })} />이수 학기 수로 나눠 학기당 값으로 보기</label>
          )}

          {filterable.length > 0 && source.method !== "language" && (
            <div className="space-y-2">
              <label className={label}>일부 내역만 보기
                <select disabled={disabled} value={source.filter?.fieldId ?? ""} onChange={(e) => set({ filter: e.target.value ? { fieldId: e.target.value, values: [] } : null })} className={`${field} sm:w-1/2`}>
                  <option value="">전체 내역</option>
                  {filterable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              {source.filter && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {filterField?.options?.map((value) => (
                    <label key={value} className="flex items-center gap-1.5 text-[15px] text-sub">
                      <input type="checkbox" className="h-4 w-4 accent-brand" disabled={disabled} checked={source.filter!.values.includes(value)} onChange={(e) => set({ filter: { fieldId: source.filter!.fieldId, values: e.target.checked ? [...source.filter!.values, value] : source.filter!.values.filter((v) => v !== value) } })} />
                      {value}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold text-mute">점수 기준</p>
            {source.method === "range" && <BandsEditor disabled={disabled} bands={source.bands} onChange={(bands) => set({ bands })} />}
            {source.method === "choice" && <OptionsEditor disabled={disabled} options={source.options} known={ref?.field.options} onChange={(options) => set({ options })} />}
            {source.method === "choice" && source.multiplier && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[13px] font-semibold text-mute">{findField(source.multiplier.fieldId)?.field.label} 계수 (선택지 점수에 곱해요)</p>
                {source.multiplier.factors.map((f, i) => (
                  <div key={f.value} className="flex items-center gap-2 text-[15px]">
                    <span className="w-20">{f.value}</span><span className="text-faint">×</span>
                    <Num disabled={disabled} value={f.factor} onChange={(v) => set({ multiplier: { ...source.multiplier!, factors: source.multiplier!.factors.map((x, k) => (k === i ? { ...x, factor: v } : x)) } })} className="w-16" />
                  </div>
                ))}
                {!disabled && <button type="button" className="text-sm font-semibold text-mute hover:text-bad" onClick={() => set({ multiplier: null })}>계수 쓰지 않기</button>}
              </div>
            )}
            {source.method === "language" && <p className="rounded-xl bg-soft px-4 py-3 text-sm text-sub">시험별 환산 기준은 화면 위 <b className="font-semibold">설정 › 어학 환산표</b>에서 고쳐요.</p>}
            {source.method === "narrative" && (
              <div className="space-y-2">
                <p className="text-sm text-sub">레벨 기준은 눈으로 확인할 수 있는 사실로 써 주세요. 레벨 1~5는 20·40·60·80·100점이에요.</p>
                {[1, 2, 3, 4, 5].map((level) => (
                  <div key={level} className="flex items-start gap-2">
                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vio-soft text-xs font-bold text-vio">{level}</span>
                    <textarea disabled={disabled} rows={2} value={source.levels.find((l) => l.level === level)?.criterion ?? ""} onChange={(e) => set({ levels: [1, 2, 3, 4, 5].map((l) => ({ level: l, criterion: l === level ? e.target.value : (source.levels.find((x) => x.level === l)?.criterion ?? "") })) })} className={area} />
                  </div>
                ))}
                <label className={label}>판단 불가로 볼 조건
                  <textarea disabled={disabled} rows={2} value={source.undecidable} onChange={(e) => set({ undecidable: e.target.value })} className={`${area} font-normal text-ink`} />
                </label>
              </div>
            )}
          </div>
          {!disabled && <button type="button" className="text-sm font-semibold text-mute hover:text-bad" onClick={onRemove}>이 근거 삭제</button>}
        </div>
      )}
    </div>
  );
}

function newSource(): Source {
  const fieldId = selectableFields[0].field.id;
  return { ...presetFor(fieldId)!, id: `s-${uid()}` };
}
const categoriesOf = (item: Item) => [...new Set(item.sources.map((s) => findField(s.fieldId)?.category.label ?? "템플릿에 없는 데이터"))];

function ItemModal({ competency, item, issues, disabled, onChange, onRemove, onClose }: { competency: Competency; item: Item; issues: RubricIssue[]; disabled: boolean; onChange: (change: (item: Item) => void) => void; onRemove: () => void; onClose: () => void }) {
  return (
    <Modal
      open wide onClose={onClose}
      title={disabled ? item.name : "평가 항목 수정"}
      subtitle={`${competency.name} 역량`}
      footer={<>{!disabled && <Button variant="danger" className="mr-auto" onClick={onRemove}>항목 삭제</Button>}<Button variant="primary" onClick={onClose}>{disabled ? "닫기" : "완료"}</Button></>}
    >
      <div className="space-y-6">
        {issues.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-soft px-4 py-3 text-sm">
            {issues.map((i, k) => <li key={k} className={i.level === "error" ? "font-semibold text-bad" : "text-warn"}>{i.level === "error" ? "오류" : "주의"} · {plain(i.message)}</li>)}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className={label}>항목 이름
            <input disabled={disabled} value={item.name} onChange={(e) => onChange((x) => { x.name = e.target.value; })} className={`${field} h-12 text-[17px] font-bold text-ink`} />
          </label>
          <label className={label}>{item.kind === "bonus" ? "최대 가점" : "비중"}
            <span className="flex items-center gap-1.5"><Num disabled={disabled} value={item.weight} onChange={(v) => onChange((x) => { x.weight = v; })} className="h-12 w-24 text-[17px]" /><span className="text-[15px] text-sub">{item.kind === "bonus" ? "점" : "%"}</span></span>
          </label>
        </div>
        <label className={label}>무엇을 보나요
          <textarea disabled={disabled} rows={2} value={item.description} onChange={(e) => onChange((x) => { x.description = e.target.value; })} className={`${area} font-normal text-ink`} />
        </label>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-mute">유형</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["basic", "기본형", "누구나 있을 법한 항목. 없으면 0점"], ["bonus", "가점형", "드문 실적. 있으면 더하고 없어도 감점 없음"]] as const).map(([kind, title, text]) => (
              <button key={kind} type="button" disabled={disabled} onClick={() => onChange((x) => { x.kind = kind; })} className={`rounded-2xl border-2 px-4 py-3 text-left transition ${item.kind === kind ? "border-brand bg-brand-soft" : "border-transparent bg-fill"}`}>
                <p className="text-[15px] font-bold">{title}</p><p className="text-sm text-sub">{text}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[17px] font-bold">근거 데이터 <span className="text-mute">{item.sources.length}</span></p>
            {item.sources.length > 1 && (
              <select disabled={disabled} value={item.combine} onChange={(e) => onChange((x) => { x.combine = e.target.value as Item["combine"]; })} className={`${field} h-9 text-sm`}>
                <option value="max">가장 높은 근거로 평가</option><option value="avg">있는 근거의 평균으로 평가</option>
              </select>
            )}
          </div>
          <p className="text-sm text-sub">근거가 여러 개면 대상자에게 있는 데이터만으로 평가해요. 근거를 눌러 점수 기준을 확인하세요.</p>
          {item.sources.map((source, k) => (
            <SourceEditor key={source.id} disabled={disabled} source={source} onChange={(s) => onChange((x) => { x.sources[k] = s; })} onRemove={() => onChange((x) => { x.sources.splice(k, 1); })} />
          ))}
          {!disabled && <button type="button" className="w-full rounded-2xl border-2 border-dashed border-line py-3 text-[15px] font-semibold text-mute hover:border-brand hover:text-brand" onClick={() => onChange((x) => { x.sources.push(newSource()); })}>+ 근거 추가</button>}
        </div>
      </div>
    </Modal>
  );
}

function CompetencyCard({ competency, issues, disabled, onEdit, onOpenItem, onAddItem }: { competency: Competency; issues: RubricIssue[]; disabled: boolean; onEdit: (change: (c: Competency) => void) => void; onOpenItem: (itemId: string) => void; onAddItem: () => void }) {
  const basicTotal = Math.round(competency.items.filter((i) => i.kind === "basic").reduce((acc, i) => acc + i.weight, 0) * 100) / 100;
  const weightOk = competency.items.length === 0 || Math.abs(basicTotal - 100) <= 0.01;
  const errors = issues.filter((i) => i.level === "error" && !i.itemId);
  const warnings = issues.filter((i) => i.level === "warn").length;

  return (
    <Card className="animate-rise overflow-hidden">
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold tracking-tight">{competency.name}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-sub">{competency.description}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${weightOk ? "bg-fill text-sub" : "bg-bad-soft text-bad"}`}>합계 {basicTotal}%</span>
        </div>
        {errors.map((i, k) => <p key={k} className="mt-2 text-sm font-semibold text-bad">{plain(i.message)}</p>)}
      </div>

      <ul>
        {competency.items.map((item) => {
          const itemIssues = issues.filter((i) => i.itemId === item.id);
          const hasError = itemIssues.some((i) => i.level === "error");
          return (
            <li key={item.id} className="border-t border-fill">
              <button type="button" onClick={() => onOpenItem(item.id)} className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-soft">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[16px] font-bold">
                    {item.name}
                    {item.kind === "bonus" && <Badge tone="green">가점</Badge>}
                    {item.sources.some((s) => s.method === "narrative") && <Badge tone="violet">AI 판정</Badge>}
                    {hasError && <Badge tone="red">오류</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-mute">{categoriesOf(item).join(" · ") || "근거 없음"}</p>
                </div>
                <div className="w-24 shrink-0 text-right">
                  <p className="text-[17px] font-bold tabular-nums">{item.kind === "bonus" ? `+${item.weight}점` : `${item.weight}%`}</p>
                  {item.kind === "basic" && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, item.weight)}%` }} /></div>}
                </div>
                <span className="text-xl text-faint">›</span>
              </button>
            </li>
          );
        })}
        {competency.items.length === 0 && <li className="border-t border-fill px-6 py-5 text-[15px] text-mute">평가 항목이 없어 이 역량은 항상 판정 보류가 돼요.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fill px-6 py-3.5">
        {!disabled && <button type="button" className={textLink} onClick={onAddItem}>+ 평가 항목 추가</button>}
        {warnings > 0 && <span className="text-sm text-warn">확인하면 좋은 점 {warnings}건</span>}
        <details className="group ml-auto w-full sm:w-auto">
          <summary className="list-none text-right text-sm font-semibold text-mute hover:text-sub">메모{competency.note ? " 있음" : ""} · 측정 가능성 {competency.measurability} <span className="text-faint">⌄</span></summary>
          <div className="mt-3 space-y-2 sm:w-[28rem]">
            <textarea disabled={disabled} rows={3} value={competency.note} placeholder="측정하기 어려운 부분, 필요한 추가 데이터 메모" onChange={(e) => onEdit((c) => { c.note = e.target.value; })} className={area} />
            <label className="flex items-center gap-2 text-sm text-sub">이 데이터로 측정할 수 있는 정도
              <select disabled={disabled} value={competency.measurability} onChange={(e) => onEdit((c) => { c.measurability = e.target.value as Competency["measurability"]; })} className={`${field} h-9`}><option>상</option><option>중</option><option>하</option></select>
            </label>
          </div>
        </details>
      </div>
    </Card>
  );
}

type SettingsTab = "grade" | "language" | "etc";

export default function RubricEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meta, setMeta] = useState<RecordMeta | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [dirty, setDirty] = useState(false);
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ competencyId: string; itemId: string } | null>(null);
  const [panel, setPanel] = useState<"issues" | "settings" | "preview" | "confirm" | null>(null);
  const [tab, setTab] = useState<SettingsTab>("grade");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ record: RecordMeta & { body: Rubric }; versions: VersionRow[] }>(`/api/rubrics/${id}`)
      .then((d) => { setMeta(d.record); setRubric(d.record.body); setVersions(d.versions); setDirty(false); })
      .catch(setError);
    api<{ submissions: { student: ParsedStudent }[] }>("/api/submissions").then((d) => setStudents(d.submissions.map((s) => s.student).filter((s) => s.evaluable))).catch(() => undefined);
  }, [id]);

  const issues = useMemo(() => (rubric ? validateRubric(rubric) : []), [rubric]);
  const preview = useMemo(() => (rubric && panel === "preview" ? students.map((s) => ({ name: s.name ?? s.sheetName, result: evaluateStudent(rubric, s) })) : []), [rubric, students, panel]);

  if (!rubric || !meta) return error ? <ErrorNote error={error} /> : <p className="py-20 text-center text-mute">불러오는 중…</p>;
  const disabled = meta.status === "confirmed";
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.length - errorCount;
  const mutate: Mutate = (change) => { const next = structuredClone(rubric); change(next); setRubric(next); setDirty(true); setSaved(false); };

  const groups = [...new Set(rubric.competencies.map((c) => c.group))];
  const activeGroup = group !== null && groups.includes(group) ? group : groups[0];
  const visible = groups.length > 1 ? rubric.competencies.filter((c) => c.group === activeGroup) : rubric.competencies;
  const itemCount = rubric.competencies.reduce((acc, c) => acc + c.items.length, 0);
  const editingCompetency = editing ? rubric.competencies.find((c) => c.id === editing.competencyId) : undefined;
  const editingItem = editingCompetency?.items.find((i) => i.id === editing?.itemId);

  async function save(): Promise<boolean> {
    try {
      await sendJson(`/api/rubrics/${id}`, { body: rubric }, "PUT");
      setDirty(false); setError(null); setSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? new Error("오류가 있어 저장하지 않았어요. 빨간 표시가 있는 항목을 고쳐 주세요.") : e);
      return false;
    }
  }
  async function confirm() {
    setPanel(null);
    if (dirty && !(await save())) return;
    try {
      await sendJson<{ version: string }>(`/api/rubrics/${id}`, { action: "confirm" });
      router.push("/students");
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
  function addItem(competencyId: string) {
    const itemId = `i-${uid()}`;
    mutate((r) => { r.competencies.find((c) => c.id === competencyId)!.items.push({ id: itemId, name: "새 평가 항목", description: "", weight: 0, kind: "basic", combine: "max", sources: [newSource()] }); });
    setEditing({ competencyId, itemId });
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <StepBack back={{ href: "/competencies", label: "역량 입력" }} />
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-brand">STEP 2 {disabled ? <Badge tone="blue">확정 {meta.version} · 잠김</Badge> : <Badge tone="amber">초안</Badge>}</p>
        <input disabled={disabled} value={rubric.name} onChange={(e) => mutate((r) => { r.name = e.target.value; })} aria-label="평가기준표 이름" className="w-full rounded-lg bg-transparent text-[28px] font-bold leading-[1.35] tracking-tight outline-none focus:bg-white" />
        <p className="mt-2 text-[16px] leading-relaxed text-sub">
          {disabled ? "확정된 기준표예요. 고치려면 새 버전을 만들어 주세요." : rubric.generatedBy === "ai" ? "AI가 만든 초안이에요. 항목을 눌러 점수 기준을 확인하고 고쳐 주세요." : "항목을 눌러 점수 기준을 확인하고 고쳐 주세요."}
        </p>
      </header>
      <ErrorNote error={error} />

      <div className="flex animate-rise flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-4 text-[15px] text-sub">
          <span>역량 <b className="font-bold text-ink">{rubric.competencies.length}</b></span>
          <span>평가 항목 <b className="font-bold text-ink">{itemCount}</b></span>
        </div>
        <button type="button" onClick={() => setPanel("issues")} className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold ${errorCount > 0 ? "bg-bad-soft text-bad" : warnCount > 0 ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>
          {errorCount > 0 ? `고칠 곳 ${errorCount}건` : warnCount > 0 ? `확인하면 좋은 점 ${warnCount}건` : "✓ 문제 없음"}
        </button>
        {students.length > 0 && <Button size="sm" onClick={() => setPanel("preview")}>미리 채점</Button>}
        <Button size="sm" onClick={() => setPanel("settings")}>⚙ 설정</Button>
      </div>

      {groups.length > 1 && (
        <Segmented value={activeGroup} onChange={setGroup} options={groups.map((g) => ({ value: g, label: <>{g || "기타"} <span className="ml-0.5 text-faint">{rubric.competencies.filter((c) => c.group === g).length}</span></> }))} />
      )}

      <div className="space-y-4" key={activeGroup}>
        {visible.map((competency) => (
          <CompetencyCard
            key={competency.id} competency={competency} disabled={disabled}
            issues={issues.filter((i) => i.competencyId === competency.id)}
            onEdit={(change) => mutate((r) => change(r.competencies.find((c) => c.id === competency.id)!))}
            onOpenItem={(itemId) => setEditing({ competencyId: competency.id, itemId })}
            onAddItem={() => addItem(competency.id)}
          />
        ))}
      </div>

      {editingCompetency && editingItem && (
        <ItemModal
          competency={editingCompetency} item={editingItem} disabled={disabled}
          issues={issues.filter((i) => i.itemId === editingItem.id && i.competencyId === editingCompetency.id)}
          onChange={(change) => mutate((r) => change(r.competencies.find((c) => c.id === editing!.competencyId)!.items.find((i) => i.id === editing!.itemId)!))}
          onRemove={() => { mutate((r) => { const c = r.competencies.find((x) => x.id === editing!.competencyId)!; c.items = c.items.filter((i) => i.id !== editing!.itemId); }); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}

      <Modal open={panel === "issues"} onClose={() => setPanel(null)} title="기준표 점검" subtitle={errorCount > 0 ? "빨간 항목은 고쳐야 저장·확정할 수 있어요" : "노란 항목은 그대로 두어도 확정할 수 있어요"}>
        {issues.length === 0 ? <p className="py-8 text-center text-[16px] text-sub">🎉 문제가 없어요</p> : (
          <ul className="space-y-2">
            {[...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1)).map((i, k) => (
              <li key={k}>
                <button type="button" disabled={!i.competencyId} onClick={() => { const c = rubric.competencies.find((x) => x.id === i.competencyId); if (c) { setGroup(c.group); setPanel(null); if (i.itemId) setEditing({ competencyId: c.id, itemId: i.itemId }); } }} className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left text-[15px] ${i.level === "error" ? "bg-bad-soft" : "bg-soft"}`}>
                  <Badge tone={i.level === "error" ? "red" : "amber"} className="mt-0.5">{i.level === "error" ? "오류" : "주의"}</Badge>
                  <span className="flex-1 leading-relaxed">{i.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={panel === "preview"} onClose={() => setPanel(null)} wide title="미리 채점" subtitle="올려 둔 대상자를 지금 기준으로 바로 채점한 결과예요. AI 서술 판정 항목은 빠져 있어요.">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-center text-sm">
            <thead><tr><th />{visible.map((c) => <th key={c.id} className="max-w-20 px-1 pb-1 text-xs font-semibold text-sub" title={c.name}><span className="block truncate">{c.name}</span></th>)}</tr></thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.name}>
                  <td className="whitespace-nowrap pr-3 text-left text-[15px] font-bold">{p.name}</td>
                  {p.result.competencies.filter((c) => visible.some((v) => v.id === c.competencyId)).map((c) => (
                    <td key={c.competencyId} className="h-10 min-w-14 rounded-lg font-bold tabular-nums" style={heatColor(c.score)} title={`${c.name} · 충족도 ${c.coverage}%`}>{c.hold ? "보류" : c.score}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {groups.length > 1 && <p className="mt-4 text-sm text-mute">지금 보고 있는 구분({activeGroup || "기타"})의 역량만 보여요.</p>}
      </Modal>

      <Modal open={panel === "settings"} onClose={() => setPanel(null)} wide title="설정">
        <Segmented value={tab} onChange={setTab} options={[{ value: "grade", label: "등급·판정 규칙" }, { value: "language", label: "어학 환산표" }, { value: "etc", label: "버전·내보내기" }]} />
        {tab === "grade" && (
          <div className="mt-6 space-y-6">
            <div>
              <p className="mb-2 text-[15px] font-bold">등급 기준</p>
              <div className="flex flex-wrap gap-2">
                {[...rubric.settings.grades].sort((a, b) => b.min - a.min).map((g) => {
                  const index = rubric.settings.grades.indexOf(g);
                  return (
                    <div key={index} className="flex items-center gap-1.5 rounded-2xl bg-soft p-2 text-sm text-sub">
                      <input disabled={disabled} value={g.grade} aria-label="등급 이름" onChange={(e) => mutate((r) => { r.settings.grades[index].grade = e.target.value; })} className={`${field} w-12 bg-white text-center font-bold text-ink`} />
                      <Num disabled={disabled} value={g.min} onChange={(v) => mutate((r) => { r.settings.grades[index].min = v; })} className="w-16 bg-white" />점 이상
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3 text-[15px] text-sub">
              <label className="flex items-center gap-2">데이터 충족도가 <Num disabled={disabled} value={rubric.settings.holdThreshold} onChange={(v) => mutate((r) => { r.settings.holdThreshold = v; })} className="w-16" />% 미만이면 판정 보류</label>
              <label className="flex items-center gap-2">AI 서술 판정 비중은 최대 <Num disabled={disabled} value={rubric.settings.qualWeightCap} onChange={(v) => mutate((r) => { r.settings.qualWeightCap = v; })} className="w-16" />%</label>
              <label className="flex items-center gap-2">AI 서술 판정이 바꿀 수 있는 점수는 ±<Num disabled={disabled} value={rubric.settings.qualSwing} onChange={(v) => mutate((r) => { r.settings.qualSwing = v; })} className="w-16" />점</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand" disabled={disabled} checked={rubric.settings.excludeExpired} onChange={(e) => mutate((r) => { r.settings.excludeExpired = e.target.checked; })} />유효기간이 지난 성적은 빼고 계산</label>
            </div>
          </div>
        )}
        {tab === "language" && (
          <div className="mt-6 space-y-4">
            <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">이 환산표는 근거 없이 임의로 채운 기본값이에요. 기관 기준에 맞게 꼭 검토해 주세요.</p>
            {rubric.languageTable.map((entry, i) => (
              <details key={entry.exam} className="rounded-2xl border border-line">
                <summary className="flex list-none items-center gap-2 px-4 py-3.5 text-[15px] font-bold">{entry.exam} <Badge>{entry.basis === "score" ? "점수 기준" : "등급 기준"}</Badge><span className="ml-auto text-faint">⌄</span></summary>
                <div className="border-t border-line px-4 py-4">
                  {entry.basis === "score"
                    ? <BandsEditor disabled={disabled} bands={entry.bands} onChange={(bands) => mutate((r) => { r.languageTable[i].bands = bands; })} />
                    : <OptionsEditor disabled={disabled} options={entry.options} onChange={(options) => mutate((r) => { r.languageTable[i].options = options; })} />}
                </div>
              </details>
            ))}
          </div>
        )}
        {tab === "etc" && (
          <div className="mt-6 space-y-5">
            <div>
              <p className="mb-2 text-[15px] font-bold">버전</p>
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link href={`/rubrics/${v.id}`} onClick={() => setPanel(null)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] ${v.id === id ? "bg-brand-soft font-bold" : "hover:bg-fill"}`}>
                      <span>{v.version ?? "초안"}</span><span className="text-sm font-normal text-mute">{formatTime(v.updatedAt)}</span>{v.id === id && <span className="ml-auto text-sm text-brand">지금 보는 버전</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Button onClick={download}>JSON 파일로 내보내기</Button>
          </div>
        )}
      </Modal>

      <Modal
        open={panel === "confirm"} onClose={() => setPanel(null)} title="이 기준표로 확정할까요?"
        subtitle="확정하면 이 버전은 잠겨서 더 고칠 수 없어요. 나중에 고치려면 새 버전을 만들면 돼요."
        footer={<><Button onClick={() => setPanel(null)}>더 살펴보기</Button><Button variant="primary" onClick={confirm}>확정하기</Button></>}
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["역량", rubric.competencies.length], ["평가 항목", itemCount], ["확인하면 좋은 점", warnCount]].map(([name, value]) => (
            <div key={name} className="rounded-2xl bg-soft py-4"><p className="text-2xl font-bold tabular-nums">{value}</p><p className="mt-0.5 text-sm text-mute">{name}</p></div>
          ))}
        </div>
      </Modal>

      {disabled ? (
        <BottomBar hint={<><b className="font-bold text-ink">확정 {meta.version}</b> · 이 기준표로 평가할 수 있어요</>}>
          <Button onClick={fork}>새 버전으로 수정</Button>
          <Link href="/students" className={buttonClass("primary", "lg")}>대상자 데이터 넣기</Link>
        </BottomBar>
      ) : (
        <BottomBar hint={errorCount > 0 ? <span className="font-semibold text-bad">고칠 곳 {errorCount}건을 해결하면 확정할 수 있어요</span> : dirty ? "저장하지 않은 변경이 있어요" : saved ? <span className="font-semibold text-good">✓ 저장했어요</span> : "다 확인했으면 확정해 주세요"}>
          <Button disabled={!dirty || errorCount > 0} onClick={save}>저장</Button>
          <Button variant="primary" size="lg" disabled={errorCount > 0} onClick={() => setPanel("confirm")}>확정하고 다음으로</Button>
        </BottomBar>
      )}
    </div>
  );
}
