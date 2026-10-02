"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Card, ErrorNote, formatTime } from "@/components/ui";
import type { CompetencyResult, ItemResult, QualMap } from "@/lib/rubric/engine";
import { METHOD_LABEL, type Rubric } from "@/lib/rubric/types";
import type { RunResult, RunStudent } from "@/lib/run";

type Mode = "operator" | "student";
const BAR = "#2a78d6";
const TRACK = "#cde2fb";

function ScoreBar({ result, rubric }: { result: CompetencyResult; rubric: Rubric }) {
  const ticks = rubric.settings.grades.filter((g) => g.min > 0 && g.min < 100);
  return (
    <div className="relative h-3 w-full" title={result.hold ? "판정 보류" : `${result.score}점 (${result.grade}등급)`}>
      <div className="absolute inset-0 rounded" style={{ background: result.hold ? "#f0efec" : TRACK }} />
      {!result.hold && <div className="absolute inset-y-0 left-0 rounded-l rounded-r-[4px]" style={{ width: `${result.score}%`, background: BAR }} />}
      {ticks.map((g) => (
        <div key={g.grade} className="absolute -top-1 h-5 w-px bg-slate-500/60" style={{ left: `${g.min}%` }} title={`${g.grade} ${g.min}점 이상`} />
      ))}
    </div>
  );
}

function GradeAxis({ rubric }: { rubric: Rubric }) {
  return (
    <div className="relative h-4 text-[10px] text-slate-500">
      {rubric.settings.grades.filter((g) => g.min > 0 && g.min < 100).map((g) => (
        <span key={g.grade} className="absolute -translate-x-1/2" style={{ left: `${g.min}%` }}>{g.grade} {g.min}</span>
      ))}
    </div>
  );
}

const REASON_TEXT: Record<string, string> = {
  미수집: "데이터가 수집되지 않아 계산에서 뺐습니다(0점 아님)",
  "해당 없음": "이 학생에게 해당하지 않아 계산에서 뺐습니다(불이익 없음)",
  "판단 불가": "서술로 판단할 수 없어 계산에서 뺐습니다(0점 아님)",
  만료: "유효기간이 지난 성적이라 계산에서 뺐습니다",
  "기준 없음": "이 값에 맞는 점수 기준이 없어 계산에서 뺐습니다",
};

function QualCards({ item, qual, rubric, competencyId }: { item: ItemResult; qual: QualMap; rubric: Rubric; competencyId: string }) {
  const sources = rubric.competencies.find((c) => c.id === competencyId)?.items.find((i) => i.id === item.itemId)?.sources ?? [];
  return (
    <>
      {item.sources.filter((s) => s.method === "narrative" && qual[s.sourceId]).map((s) => {
        const j = qual[s.sourceId];
        const levels = sources.find((x) => x.id === s.sourceId)?.levels ?? [];
        return (
          <div key={s.sourceId} className="mt-2 rounded border border-violet-200 bg-violet-50 p-3 text-sm">
            <p className="font-medium text-violet-900">
              서술 판정 · {j.level === null ? "판단 불가" : `레벨 ${j.level} (${j.level * 20}점)`}
              {j.borderline && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">경계 사례 — 낮은 레벨로 판정</span>}
              {j.flagged && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">서술 안에 지시문 의심 — 확인 필요</span>}
            </p>
            {j.level !== null && <p className="mt-1 text-slate-700">기준: {levels.find((l) => l.level === j.level)?.criterion}</p>}
            {j.quotes.map((q, i) => <blockquote key={i} className="mt-1 border-l-2 border-violet-300 pl-2 text-slate-700">“{q}”</blockquote>)}
            <p className="mt-1 text-slate-700">판정 이유: {j.reason}</p>
            {j.adjacentReason && <p className="text-slate-600">위 레벨이 아닌 이유: {j.adjacentReason}</p>}
          </div>
        );
      })}
    </>
  );
}

function OperatorDetail({ result, qual, rubric }: { result: CompetencyResult; qual: QualMap; rubric: Rubric }) {
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr><th className="px-2 py-1">평가 항목</th><th className="px-2 py-1">근거 데이터</th><th className="px-2 py-1">사용한 데이터</th><th className="px-2 py-1">적용 기준</th><th className="px-2 py-1 text-right">근거 점수</th><th className="px-2 py-1 text-right">항목 점수 × 비중</th><th className="px-2 py-1 text-right">기여</th></tr>
          </thead>
          <tbody>
            {result.items.map((item) => item.sources.map((s, k) => (
              <tr key={s.sourceId} className="border-t border-slate-200 align-top">
                {k === 0 && (
                  <td rowSpan={item.sources.length} className="px-2 py-1.5 font-medium">
                    {item.name}
                    {item.kind === "bonus" && <span className="ml-1 rounded bg-white px-1 text-xs font-normal text-slate-500">가점형</span>}
                    <QualCards item={item} qual={qual} rubric={rubric} competencyId={result.competencyId} />
                  </td>
                )}
                <td className="px-2 py-1.5">{s.label}<span className="ml-1 text-xs text-slate-400">{METHOD_LABEL[s.method]}</span></td>
                <td className="px-2 py-1.5">{s.data}</td>
                <td className="px-2 py-1.5 text-slate-600">{s.status === "scored" ? s.rule : <span className="text-amber-700">{REASON_TEXT[s.reason ?? ""] ?? s.reason}{s.rule ? ` · ${s.rule}` : ""}</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.score ?? "–"}</td>
                {k === 0 && (
                  <>
                    <td rowSpan={item.sources.length} className="px-2 py-1.5 text-right tabular-nums">
                      {item.status === "scored" ? `${item.score} × ${item.weight}${item.kind === "bonus" ? "점" : "%"}` : <span className="text-amber-700">제외 ({item.reason})</span>}
                    </td>
                    <td rowSpan={item.sources.length} className="px-2 py-1.5 text-right font-medium tabular-nums">{item.contribution ?? "–"}</td>
                  </>
                )}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p>
        <span className="text-slate-500">계산식: </span><span className="tabular-nums">{result.formula}</span>
        {result.score !== null && <span className="tabular-nums"> → 반올림 {result.score}점</span>}
        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${result.checksumOk ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{result.checksumOk ? "검산 일치: 기여 점수 합 = 역량 점수" : "검산 불일치"}</span>
      </p>
      {result.adjustments.map((a) => <p key={a.label} className="text-slate-600">조정: {a.label} {a.amount > 0 ? "+" : ""}{a.amount}</p>)}
      {result.hold && <p className="text-amber-800">데이터 충족도 {result.coverage}%가 기준 {rubric.settings.holdThreshold}%에 못 미쳐 등급을 내지 않았습니다.</p>}
      {result.missing.length > 0 && <p className="text-slate-600">계산에서 빠진 항목(데이터를 등록하면 평가됨): {result.missing.join(" / ")}</p>}
    </div>
  );
}

function wording(score: number) {
  return score >= 80 ? "잘하고 있어요" : score >= 60 ? "보통이에요" : "더 채워 볼 수 있어요";
}

function StudentFriendly({ result }: { result: CompetencyResult }) {
  return (
    <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
      {result.hold && <p className="text-amber-800">아직 평가할 자료가 부족해서 등급을 내지 않았어요. 자료가 없다고 낮은 점수를 받은 것이 아닙니다.</p>}
      {result.items.map((item) => (
        <p key={item.itemId}>
          <span className="font-medium">{item.name}</span>:{" "}
          {item.status === "scored"
            ? `${wording(item.score as number)} — ${item.sources.filter((s) => s.status === "scored").map((s) => (s.data.startsWith("활동 없음") ? `${s.label.split(" › ")[0]} 활동이 없어요` : `${s.label.split(" › ")[1]} ${s.data}`)).join(", ")}`
            : item.reason === "해당 없음" ? "나에게 해당하지 않는 항목이라 평가에서 뺐어요." : `자료가 없어서 평가에서 뺐어요. (${[...new Set(item.sources.map((s) => s.label.split(" › ")[0]))].join(", ")} 자료를 등록하면 평가돼요)`}
        </p>
      ))}
    </div>
  );
}

function StudentPanel({ student, rubric, mode }: { student: RunStudent; rubric: Rubric; mode: Mode }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = [...new Set(student.evaluation.competencies.map((c) => c.group))];
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_7rem] items-end gap-3 border-b border-slate-200 px-4 pb-1 pt-3 text-xs text-slate-500">
          <span>역량</span><GradeAxis rubric={rubric} /><span className="text-right">점수 · 등급</span>
        </div>
        {groups.map((group) => (
          <div key={group}>
            {group && <div className="bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-600">{group}</div>}
            {student.evaluation.competencies.filter((c) => c.group === group).map((c) => (
              <div key={c.competencyId} className="border-t border-slate-100">
                <button type="button" onClick={() => setOpen(open === c.competencyId ? null : c.competencyId)} className="grid w-full grid-cols-[minmax(8rem,14rem)_1fr_7rem] items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {mode === "operator" && <span className="block text-xs text-slate-500">충족도 {c.coverage}%{c.reliability && ` · 신뢰도 ${c.reliability}`}</span>}
                  </span>
                  <ScoreBar result={c} rubric={rubric} />
                  <span className="text-right text-sm tabular-nums">{c.hold ? <span className="text-amber-700">판정 보류</span> : <><span className="font-semibold">{c.score}점</span> · {c.grade}</>}</span>
                </button>
                {open === c.competencyId && (mode === "operator" ? <OperatorDetail result={c} qual={student.qual} rubric={rubric} /> : <StudentFriendly result={c} />)}
              </div>
            ))}
          </div>
        ))}
      </Card>
      <p className="text-xs text-slate-500">역량을 누르면 {mode === "operator" ? "계산 과정과 근거" : "어떤 자료로 평가했는지"}가 열립니다. 세로 눈금은 등급 경계입니다.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 font-semibold">강점</h3>
          {student.feedback.strengths.length === 0 ? <p className="text-sm text-slate-500">80점 이상인 항목이 아직 없습니다.</p> : (
            <ul className="space-y-2 text-sm">{student.feedback.strengths.map((f, i) => <li key={i}><span className="font-medium">{f.competency} · {f.item}</span><br /><span className="text-slate-600">{mode === "operator" ? f.text : f.text.replace(/ \(\d+(\.\d+)?점\)$/, "")}</span></li>)}</ul>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 font-semibold">개선점</h3>
          {student.feedback.improvements.length === 0 ? <p className="text-sm text-slate-500">70점 미만인 항목이 없습니다.</p> : (
            <ul className="space-y-2 text-sm">{student.feedback.improvements.map((f, i) => <li key={i}><span className="font-medium">{f.competency} · {f.item}</span><br /><span className="text-slate-600">{f.text}</span></li>)}</ul>
          )}
          <p className="mt-3 text-xs text-slate-400">기관이 등록한 프로그램이 없어 프로그램 추천은 하지 않습니다.</p>
        </Card>
      </div>
      {student.feedback.toRegister.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">판정 보류된 역량은 다음 자료를 등록하면 평가됩니다: {student.feedback.toRegister.join(", ")}</p>
      )}
      {mode === "operator" && student.unusedCategories.length > 0 && (
        <p className="text-sm text-slate-500">이번 기준에서 쓰지 않은 데이터: {student.unusedCategories.join(", ")}</p>
      )}
    </div>
  );
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunResult | null>(null);
  const [mode, setMode] = useState<Mode>("operator");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ run: RunResult; workspace: { kind: string } }>(`/api/runs/${id}`)
      .then((d) => { setRun(d.run); setMode(d.workspace.kind === "student" ? "student" : "operator"); })
      .catch(setError);
  }, [id]);

  if (!run) return error ? <ErrorNote error={error} /> : <p className="text-slate-500">불러오는 중…</p>;
  const all = run.students.flatMap((s) => s.evaluation.competencies);
  const graded = all.filter((c) => !c.hold);
  const distribution = run.rubricBody.settings.grades.map((g) => ({ grade: g.grade, count: graded.filter((c) => c.grade === g.grade).length }));
  const student = run.students[selected];
  const competencies = run.rubricBody.competencies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">평가 결과</h1>
        <div className="ml-auto flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {(["operator", "student"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{m === "operator" ? "운영자용" : "학생용"}</button>
          ))}
        </div>
        {mode === "operator" && (
          <>
            <a href={`/api/runs/${id}/export`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">엑셀 내보내기</a>
            <a href={`/api/runs/${id}/export?format=json`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">JSON 내보내기</a>
          </>
        )}
      </div>
      <p className="text-sm text-slate-600">
        채점기준표 <span className="font-medium">{run.rubric.name} {run.rubric.version}</span> · 실행 {formatTime(run.executedAt)}
        {mode === "operator" && <> · {run.ai.used ? `서술 판정 모델 ${run.ai.model} (프롬프트 ${run.ai.judgePrompt})` : "AI 미사용(서술 판정 항목은 판단 불가 처리)"}</>}
      </p>
      {run.excluded.map((e) => <p key={e.name} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{e.name}: {e.reason}</p>)}

      {mode === "operator" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-slate-500">평가한 학생</p><p className="text-2xl font-semibold tabular-nums">{run.students.length}명</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">평균 데이터 충족도</p><p className="text-2xl font-semibold tabular-nums">{all.length ? Math.round(all.reduce((a, c) => a + c.coverage, 0) / all.length) : 0}%</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">판정 보류</p><p className="text-2xl font-semibold tabular-nums">{all.length - graded.length}건 <span className="text-sm font-normal text-slate-500">/ {all.length}</span></p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">등급 분포</p><p className="text-sm tabular-nums">{distribution.map((d) => `${d.grade} ${d.count}`).join(" · ")}</p></Card>
          </div>

          {run.students.length > 1 && (
            <Card className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr><th className="sticky left-0 bg-slate-100 px-3 py-2">학생 × 역량</th>{competencies.map((c) => <th key={c.id} className="max-w-24 px-2 py-2 font-medium" title={`${c.group} ${c.name}`}><span className="block truncate">{c.name}</span></th>)}</tr>
                </thead>
                <tbody>
                  {run.students.map((s, i) => (
                    <tr key={s.submissionId} onClick={() => setSelected(i)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${i === selected ? "bg-blue-50" : ""}`}>
                      <td className={`sticky left-0 whitespace-nowrap px-3 py-1.5 font-medium ${i === selected ? "bg-blue-50" : "bg-white"}`}>{s.name}</td>
                      {s.evaluation.competencies.map((c) => <td key={c.competencyId} className="px-2 py-1.5 text-center tabular-nums" title={`충족도 ${c.coverage}%`}>{c.hold ? <span className="text-amber-700">보류</span> : <>{c.score} <span className="text-slate-500">{c.grade}</span></>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {run.students.length > 1 && mode === "student" && (
        <div className="flex flex-wrap gap-2">
          {run.students.map((s, i) => <button key={s.submissionId} type="button" onClick={() => setSelected(i)} className={`rounded-md border px-3 py-1 text-sm ${i === selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{s.name}</button>)}
        </div>
      )}

      {student && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{student.name}{mode === "operator" && student.studentId && <span className="ml-2 text-sm font-normal text-slate-500">{student.studentId}</span>}</h2>
          <StudentPanel key={`${student.submissionId}-${mode}`} student={student} rubric={run.rubricBody} mode={mode} />
        </section>
      )}
    </div>
  );
}
