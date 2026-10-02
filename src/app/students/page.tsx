"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Button, ErrorNote, PageTitle } from "@/components/ui";
import type { DataStatus } from "@/lib/template/dictionary";
import type { FieldValue, Issue, ParsedCategory, ParsedStudent } from "@/lib/template/parse";

interface Submission { id: string; fileName: string; student: ParsedStudent }
interface Report { fileName: string; saved: number; error?: string }

const STATUS_STYLE: Record<DataStatus, string> = {
  "값 있음": "bg-emerald-100 text-emerald-800",
  "활동 없음": "bg-slate-200 text-slate-700",
  미수집: "bg-amber-100 text-amber-800",
  "해당 없음": "bg-sky-100 text-sky-800",
};
const STATUS_HINT: Record<DataStatus, string> = {
  "값 있음": "기준표대로 계산",
  "활동 없음": "0점으로 계산에 포함",
  미수집: "계산에서 제외",
  "해당 없음": "계산에서 제외(불이익 없음)",
};
const LEVEL_STYLE: Record<Issue["level"], string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};
const LEVEL_LABEL: Record<Issue["level"], string> = { error: "오류", warn: "경고", info: "참고" };

function StatusBadge({ status }: { status: DataStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>;
}

function ValueCell({ field }: { field: FieldValue }) {
  if (field.state === "empty") return <span className="text-slate-400">빈칸</span>;
  if (field.state === "invalid") {
    return (
      <span className="text-red-700" title={field.note}>
        {String(field.raw)} <span className="text-xs">({field.note})</span>
      </span>
    );
  }
  return (
    <span>
      {String(field.value)}
      {field.note && <span className="ml-1 text-xs text-amber-700">({field.note})</span>}
    </span>
  );
}

function CategoryDetail({ category }: { category: ParsedCategory }) {
  if (!category.hasValues) return <p className="text-sm text-slate-500">입력된 값이 없습니다.</p>;
  return (
    <div className="space-y-3 text-sm">
      {category.fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {category.fields.map((f) => (
            <div key={f.id} className="flex gap-2">
              <dt className="shrink-0 text-slate-500">{f.label}</dt>
              <dd><ValueCell field={f} /></dd>
            </div>
          ))}
        </dl>
      )}
      {category.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {category.rows[0].cells.map((c) => (
                  <th key={c.id} className="whitespace-nowrap px-2 py-1 font-normal">{c.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {category.rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  {row.cells.map((c) => (
                    <td key={c.id} className="px-2 py-1"><ValueCell field={c} /></td>
                  ))}
                  <td className="px-2 py-1">
                    {row.expired && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">만료</span>}
                  </td>
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
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-semibold">기본정보</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {student.basic.map((f) => (
            <div key={f.id} className="flex gap-2">
              <dt className="shrink-0 text-slate-500">{f.label}</dt>
              <dd><ValueCell field={f} /></dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">점검 결과 {student.issues.length > 0 && <span className="text-slate-500">({student.issues.length}건)</span>}</h3>
        {student.issues.length === 0 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">문제가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {student.issues.map((issue, i) => (
              <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${LEVEL_STYLE[issue.level]}`}>
                <span className="mr-2 font-semibold">{LEVEL_LABEL[issue.level]}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">카테고리별 데이터 상태</h3>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {groups.map((group) => (
            <div key={group}>
              <div className="bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-600">{group}</div>
              {student.categories.filter((c) => c.group === group).map((c) => (
                <div key={c.no} className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOpen(open === c.no ? null : c.no)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="w-6 text-slate-400">{c.no}</span>
                    <span className="font-medium">{c.label}</span>
                    {c.excludedFromScoring && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">점수 계산에 쓰지 않음</span>}
                    {c.statusNote && <span className="text-xs text-amber-700">{c.statusNote}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      <span className="hidden text-xs text-slate-400 sm:inline">{STATUS_HINT[c.status]}</span>
                      <StatusBadge status={c.status} />
                    </span>
                  </button>
                  {open === c.no && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                      <CategoryDetail category={c} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function StudentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [report, setReport] = useState<Report[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ submissions: Submission[] }>("/api/submissions").then((d) => setSubmissions(d.submissions)).catch(setError);
  }, []);

  async function send(form: FormData) {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ report: Report[]; submissions: Submission[] }>("/api/submissions", { method: "POST", body: form });
      setReport(data.report);
      setSubmissions(data.submissions);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    const form = new FormData();
    for (const file of list) form.append("files", file);
    send(form);
  }
  function sample() {
    const form = new FormData();
    form.append("sample", "1");
    send(form);
  }
  async function remove(id: string) {
    try {
      const data = await api<{ submissions: Submission[] }>("/api/submissions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      setSubmissions(data.submissions);
      if (selected === id) setSelected(null);
    } catch (e) {
      setError(e);
    }
  }

  const current = submissions.find((s) => s.id === selected)?.student ?? null;
  const count = (s: ParsedStudent, level: Issue["level"]) => s.issues.filter((i) => i.level === level).length;

  return (
    <div className="space-y-8">
      <PageTitle title="3. 학생 데이터">
        학생 데이터 양식(.xlsx)을 올리면 저장하고, 카테고리별 데이터 상태와 입력 오류를 점검합니다. 한 파일에 학생 시트가 여러 장이어도 됩니다. 같은 학번을 다시 올리면 새 데이터로 바뀝니다.
      </PageTitle>
      <ErrorNote error={error} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <label className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          엑셀 파일 선택
          <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <Button onClick={sample}>샘플 학생 6명 올리기</Button>
        {loading && <span className="text-sm text-slate-500">읽는 중…</span>}
        {report?.map((r) => (
          <span key={r.fileName} className={`text-sm ${r.error ? "text-red-700" : "text-emerald-700"}`}>{r.fileName}: {r.error ?? `${r.saved}명 저장`}</span>
        ))}
      </div>

      {submissions.length > 0 && (
        <section className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">학번</th>
                  <th className="px-3 py-2 text-right">값 있음</th>
                  <th className="px-3 py-2 text-right">활동 없음</th>
                  <th className="px-3 py-2 text-right">미수집</th>
                  <th className="px-3 py-2 text-right">해당 없음</th>
                  <th className="px-3 py-2 text-right">수집 완료율</th>
                  <th className="px-3 py-2 text-right">오류</th>
                  <th className="px-3 py-2 text-right">경고</th>
                  <th className="px-3 py-2">평가 대상</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {submissions.map(({ id, student: s }) => (
                  <tr key={id} onClick={() => setSelected(id)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${selected === id ? "bg-blue-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{s.name ?? "(이름 없음)"}</td>
                    <td className="px-3 py-2">{s.studentId ?? "-"}</td>
                    {(["값 있음", "활동 없음", "미수집", "해당 없음"] as DataStatus[]).map((st) => (
                      <td key={st} className="px-3 py-2 text-right tabular-nums">{s.counts[st]}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.completionRate * 100)}%</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${count(s, "error") ? "font-semibold text-red-700" : "text-slate-400"}`}>{count(s, "error")}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${count(s, "warn") ? "font-semibold text-amber-700" : "text-slate-400"}`}>{count(s, "warn")}</td>
                    <td className="px-3 py-2">{s.evaluable ? "대상" : <span className="text-red-700">제외</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={(e) => { e.stopPropagation(); remove(id); }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500">
            학생을 누르면 상세 점검 결과가 열립니다. 다 확인했으면 <Link href="/evaluate" className="font-medium text-blue-700 underline">평가 실행</Link>으로 가세요.
          </p>
        </section>
      )}

      {current && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{current.name ?? current.sheetName} 상세</h2>
          {!current.templateMatched && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">이 시트는 템플릿 {current.templateVersion}과 항목 구성이 다릅니다.</p>}
          <StudentDetail key={selected} student={current} />
        </section>
      )}
    </div>
  );
}
