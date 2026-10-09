"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { api, Badge, BottomBar, Button, buttonClass, Card, ErrorNote, LoadingOverlay, Modal, PageTitle, sendJson, Spinner, wait } from "@/components/ui";
import type { DataStatus } from "@/lib/template/dictionary";
import type { FieldValue, Issue, ParsedCategory, ParsedStudent } from "@/lib/template/parse";

interface Submission { id: string; fileName: string; student: ParsedStudent }
interface Report { fileName: string; saved: number; error?: string }
interface RubricRow { id: string; name: string; status: string; version: string | null }

const STATUS_TONE: Record<DataStatus, "green" | "gray" | "amber" | "blue"> = { "값 있음": "green", "활동 없음": "gray", 미수집: "amber", "해당 없음": "blue" };
const STATUS_HINT: Record<DataStatus, string> = {
  "값 있음": "기준표대로 계산해요",
  "활동 없음": "0점으로 계산에 들어가요",
  미수집: "계산에서 빼요 (0점 아님)",
  "해당 없음": "계산에서 빼요 (불이익 없음)",
};
const LEVEL: Record<Issue["level"], { label: string; tone: "red" | "amber" | "blue" }> = { error: { label: "오류", tone: "red" }, warn: { label: "경고", tone: "amber" }, info: { label: "참고", tone: "blue" } };
const RUN_STEPS = ["대상자 데이터를 확인하고 있어요", "기준표에 따라 점수를 계산하고 있어요", "서술 기록을 읽고 판정하고 있어요", "강점과 개선점을 정리하고 있어요"];

const basicOf = (s: ParsedStudent, label: string) => { const v = s.basic.find((f) => f.label === label)?.value; return v === null || v === undefined ? null : String(v); };
const profileLine = (s: ParsedStudent) => [basicOf(s, "주전공(학과)"), basicOf(s, "학년") && `${basicOf(s, "학년")}학년`].filter(Boolean).join(" · ") || (s.studentId ?? "");

function ValueCell({ field }: { field: FieldValue }) {
  if (field.state === "empty") return <span className="text-faint">빈칸</span>;
  if (field.state === "invalid") return <span className="text-bad" title={field.note}>{String(field.raw)} <span className="text-xs">({field.note})</span></span>;
  return <span>{String(field.value)}{field.note && <span className="ml-1 text-xs text-warn">({field.note})</span>}</span>;
}

function CategoryDetail({ category }: { category: ParsedCategory }) {
  if (!category.hasValues) return <p className="text-sm text-mute">입력된 값이 없어요.</p>;
  return (
    <div className="space-y-3 text-sm">
      {category.fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {category.fields.map((f) => <div key={f.id} className="flex gap-2"><dt className="shrink-0 text-mute">{f.label}</dt><dd className="font-medium"><ValueCell field={f} /></dd></div>)}
        </dl>
      )}
      {category.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead><tr className="text-mute">{category.rows[0].cells.map((c) => <th key={c.id} className="whitespace-nowrap px-2 py-1 font-medium">{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {category.rows.map((row, i) => (
                <tr key={i} className="border-t border-line align-top">
                  {row.cells.map((c) => <td key={c.id} className="px-2 py-1.5"><ValueCell field={c} /></td>)}
                  <td className="px-2 py-1.5">{row.expired && <Badge tone="red">만료</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StudentDetail({ student }: { student: ParsedStudent }) {
  const [open, setOpen] = useState<number | null>(null);
  const groups = [...new Set(student.categories.map((c) => c.group))];
  return (
    <div className="space-y-7">
      {!student.templateMatched && <p className="rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">이 시트는 양식 {student.templateVersion}과 항목 구성이 달라요.</p>}
      <div className="grid grid-cols-4 gap-2 text-center">
        {(Object.keys(STATUS_TONE) as DataStatus[]).map((status) => (
          <div key={status} className="rounded-2xl bg-soft py-3" title={STATUS_HINT[status]}><p className="text-xl font-bold tabular-nums">{student.counts[status]}</p><p className="text-xs text-mute">{status}</p></div>
        ))}
      </div>

      {student.issues.length > 0 && (
        <section>
          <h3 className="mb-2 text-[17px] font-bold">확인할 점 <span className="text-mute">{student.issues.length}</span></h3>
          <ul className="space-y-1.5">
            {student.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-soft px-4 py-3 text-[15px]"><Badge tone={LEVEL[issue.level].tone} className="mt-0.5">{LEVEL[issue.level].label}</Badge><span className="leading-relaxed">{issue.message}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[17px] font-bold">기본 정보</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-2xl bg-soft p-4 text-sm sm:grid-cols-2">
          {student.basic.map((f) => <div key={f.id} className="flex gap-2"><dt className="shrink-0 text-mute">{f.label}</dt><dd className="font-medium"><ValueCell field={f} /></dd></div>)}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-[17px] font-bold">항목별 데이터</h3>
        {groups.map((group) => (
          <div key={group} className="mb-3">
            <p className="px-1 pb-1 pt-2 text-xs font-bold text-mute">{group}</p>
            <div className="overflow-hidden rounded-2xl border border-line">
              {student.categories.filter((c) => c.group === group).map((c, i) => (
                <div key={c.no} className={i > 0 ? "border-t border-line" : ""}>
                  <button type="button" onClick={() => setOpen(open === c.no ? null : c.no)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px] hover:bg-soft">
                    <span className="flex-1 font-semibold">{c.label}{c.excludedFromScoring && <span className="ml-2 text-xs font-normal text-mute">점수에 쓰지 않음</span>}{c.statusNote && <span className="ml-2 text-xs font-normal text-warn">{c.statusNote}</span>}</span>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </button>
                  {open === c.no && <div className="border-t border-line bg-soft px-4 py-3"><p className="mb-2 text-xs text-mute">{STATUS_HINT[c.status]}</p><CategoryDetail category={c} /></div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function StudentsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [rubrics, setRubrics] = useState<RubricRow[]>([]);
  const [rubricId, setRubricId] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<Report[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ submissions: Submission[] }>("/api/submissions").then((d) => setSubmissions(d.submissions)).catch(setError);
    api<{ rubrics: RubricRow[] }>("/api/rubrics").then((d) => { const confirmed = d.rubrics.filter((r) => r.status === "confirmed"); setRubrics(confirmed); setRubricId(confirmed[0]?.id ?? ""); }).catch(() => undefined);
  }, []);

  async function send(form: FormData) {
    setLoading(true); setError(null);
    try {
      const data = await api<{ report: Report[]; submissions: Submission[] }>("/api/submissions", { method: "POST", body: form });
      setReport(data.report); setSubmissions(data.submissions);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }
  function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    const form = new FormData();
    for (const file of list) form.append("files", file);
    send(form);
  }
  function sample() { const form = new FormData(); form.append("sample", "1"); send(form); }
  async function remove(id: string) {
    try {
      const data = await api<{ submissions: Submission[] }>("/api/submissions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      setSubmissions(data.submissions); setSelected(null);
    } catch (e) { setError(e); }
  }
  const toggle = (id: string) => setSkipped((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const list = submissions ?? [];
  const targets = list.filter((s) => s.student.evaluable && !skipped.has(s.id));
  const current = list.find((s) => s.id === selected) ?? null;
  const count = (s: ParsedStudent, level: Issue["level"]) => s.issues.filter((i) => i.level === level).length;

  async function run() {
    setRunning(true); setError(null);
    try {
      const [result] = await Promise.all([sendJson<{ id: string }>("/api/runs", { rubricId, submissionIds: targets.map((t) => t.id) }), wait(3200)]);
      router.push(`/results/${result.id}`);
    } catch (e) { setError(e); setRunning(false); }
  }

  const picker = (
    <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
  );

  return (
    <div className="space-y-6">
      <PageTitle step={3} back={{ href: "/rubrics", label: "평가기준표" }} title={<>평가할 대상자의<br />데이터를 올려 주세요</>}>정해진 양식(.xlsx)으로 올려요. 한 파일에 여러 명이 들어 있어도 되고, 같은 학번을 다시 올리면 새 데이터로 바뀌어요.</PageTitle>
      <ErrorNote error={error} />
      {report?.filter((r) => r.error).map((r) => <p key={r.fileName} className="rounded-2xl bg-bad-soft px-5 py-4 text-[15px] font-medium text-bad">{r.fileName}: {r.error}</p>)}

      {submissions && list.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="animate-rise cursor-pointer rounded-3xl bg-white p-7 shadow-card transition hover:-translate-y-0.5">
            <span className="text-4xl">📂</span>
            <p className="mt-4 text-lg font-bold">엑셀 파일 올리기</p>
            <p className="mt-1 text-sm text-sub">학생 데이터 양식(.xlsx), 여러 개 가능</p>
            {picker}
          </label>
          <button type="button" onClick={sample} style={{ animationDelay: "60ms" }} className="animate-rise rounded-3xl bg-white p-7 text-left shadow-card transition hover:-translate-y-0.5">
            <span className="text-4xl">✨</span>
            <p className="mt-4 text-lg font-bold">샘플 6명으로 해 보기</p>
            <p className="mt-1 text-sm text-sub">데이터가 충실한 학생부터 많이 빠진 학생까지</p>
          </button>
        </div>
      )}
      {loading && <p className="flex items-center gap-2 text-[15px] text-sub"><Spinner className="h-4 w-4 text-brand" /> 파일을 읽고 있어요…</p>}

      {list.length > 0 && (
        <Card className="animate-rise overflow-hidden">
          <div className="flex items-center gap-3 px-6 pb-3 pt-6">
            <p className="flex-1 text-xl font-bold">대상자 <span className="text-brand">{list.length}</span>명</p>
            <label className={buttonClass("secondary", "sm", "cursor-pointer")}>+ 파일 더 올리기{picker}</label>
          </div>
          <ul>
            {list.map(({ id, student: s }, index) => {
              const on = s.evaluable && !skipped.has(id);
              const errors = count(s, "error");
              const warns = count(s, "warn");
              return (
                <li key={id} className="flex items-center border-t border-fill">
                  <button type="button" disabled={!s.evaluable} onClick={() => toggle(id)} aria-label={on ? "평가에서 빼기" : "평가에 넣기"} aria-pressed={on} className="flex h-full items-center py-4 pl-6 pr-1">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white transition ${on ? "bg-brand" : "bg-line"}`}>✓</span>
                  </button>
                  <button type="button" onClick={() => setSelected(id)} className={`flex min-w-0 flex-1 items-center gap-4 py-4 pl-3 pr-6 text-left transition hover:bg-soft ${on ? "" : "opacity-55"}`}>
                    <Avatar name={s.name ?? s.sheetName} studentId={s.studentId} index={index} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[16px] font-bold">
                        {s.name ?? "(이름 없음)"}
                        {!s.evaluable && <Badge tone="red">평가 제외</Badge>}
                        {errors > 0 && <Badge tone="red">오류 {errors}</Badge>}
                        {warns > 0 && <Badge tone="amber">경고 {warns}</Badge>}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-mute">{s.evaluable ? profileLine(s) : s.excludedReason}</p>
                    </div>
                    <div className="hidden w-36 shrink-0 sm:block">
                      <p className="mb-1.5 flex justify-between text-xs text-mute"><span>수집 완료</span><b className="font-bold text-sub tabular-nums">{Math.round(s.completionRate * 100)}%</b></p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-fill"><div className="h-full rounded-full bg-brand" style={{ width: `${s.completionRate * 100}%` }} /></div>
                    </div>
                    <span className="text-xl text-faint">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {list.length > 0 && (
        <BottomBar
          hint={rubrics.length === 0 ? "확정된 평가기준표가 있어야 평가할 수 있어요" : rubrics.length === 1 ? <><b className="font-bold text-ink">{rubrics[0].name} {rubrics[0].version}</b> 기준으로 평가해요</> : (
            <label className="flex items-center gap-2">기준표
              <select value={rubricId} onChange={(e) => setRubricId(e.target.value)} className="h-10 max-w-60 rounded-[10px] bg-fill px-3 text-[15px] font-semibold text-ink outline-none">
                {rubrics.map((r) => <option key={r.id} value={r.id}>{r.name} {r.version}</option>)}
              </select>
            </label>
          )}
        >
          {rubrics.length === 0
            ? <Link href="/rubrics" className={buttonClass("primary", "lg")}>평가기준표 확정하러 가기</Link>
            : <Button variant="primary" size="lg" disabled={running || targets.length === 0} onClick={run}>{targets.length}명 평가하기</Button>}
        </BottomBar>
      )}

      {current && (
        <Modal
          open wide onClose={() => setSelected(null)}
          title={<span className="flex items-center gap-3"><Avatar name={current.student.name ?? current.student.sheetName} studentId={current.student.studentId} index={list.indexOf(current)} />{current.student.name ?? current.student.sheetName}</span>}
          subtitle={profileLine(current.student)}
          footer={<><Button variant="danger" className="mr-auto" onClick={() => remove(current.id)}>이 대상자 삭제</Button><Button variant="primary" onClick={() => setSelected(null)}>확인</Button></>}
        >
          <StudentDetail key={current.id} student={current.student} />
        </Modal>
      )}

      <LoadingOverlay open={running} title={`${targets.length}명을 평가하고 있어요`} steps={RUN_STEPS} />
    </div>
  );
}
