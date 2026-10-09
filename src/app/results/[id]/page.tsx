"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { faceOf, HEAT_LEGEND, heatColor, HOLD_COLOR, MoodCurve, Radar, ScoreBar, SERIES_COLORS } from "@/components/charts";
import { api, Badge, Button, buttonClass, Card, ErrorNote, formatTime, Modal, Segmented, StepBack } from "@/components/ui";
import type { CompetencyResult, ItemResult, QualMap } from "@/lib/rubric/engine";
import { METHOD_LABEL, type Rubric } from "@/lib/rubric/types";
import type { RunResult, RunStudent } from "@/lib/run";

const VIO = "var(--color-vio)";
const REASON_TEXT: Record<string, string> = {
  미수집: "데이터가 없어 계산에서 뺐어요 (0점 아님)",
  "해당 없음": "해당하지 않는 항목이라 계산에서 뺐어요 (불이익 없음)",
  "판단 불가": "서술로 판단할 수 없어 계산에서 뺐어요 (0점 아님)",
  만료: "유효기간이 지난 성적이라 계산에서 뺐어요",
  "기준 없음": "이 값에 맞는 점수 기준이 없어 계산에서 뺐어요",
};

const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);
const graded = (s: RunStudent) => s.evaluation.competencies.filter((c) => !c.hold);
const averageOf = (s: RunStudent) => mean(graded(s).map((c) => c.score as number));
/** 받침이 있으면 "은", 없으면 "는". 한글로 끝나지 않으면 "은(는)". */
function topicParticle(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "은(는)";
  return code % 28 === 0 ? "는" : "은";
}
const gradeTone = (score: number | null) => (score === null ? "gray" : score >= 80 ? "violet" : score >= 60 ? "blue" : "amber") as "gray" | "violet" | "blue" | "amber";

function GradeBadge({ result, large = false }: { result: CompetencyResult; large?: boolean }) {
  return <Badge tone={gradeTone(result.score)} className={large ? "!rounded-lg !px-2.5 !py-1 !text-sm" : ""}>{result.hold ? "판정 보류" : `${result.grade}등급`}</Badge>;
}

/** 얇은 선 위의 점으로 값을 보여주는 눈금 */
function Slider({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-sub"><span className="truncate">{label}</span><span className="tabular-nums text-ink">{value === null ? "보류" : value}</span></p>
      <div className="relative h-1 rounded-full bg-[#dcd8ff]">
        {value !== null && <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vio ring-[3px] ring-white" style={{ left: `${value}%` }} />}
      </div>
    </div>
  );
}

function QualCard({ item, qual, rubric, competencyId, demo }: { item: ItemResult; qual: QualMap; rubric: Rubric; competencyId: string; demo: boolean }) {
  const sources = rubric.competencies.find((c) => c.id === competencyId)?.items.find((i) => i.id === item.itemId)?.sources ?? [];
  return (
    <>
      {item.sources.filter((s) => s.method === "narrative" && qual[s.sourceId]).map((s) => {
        const j = qual[s.sourceId];
        const levels = sources.find((x) => x.id === s.sourceId)?.levels ?? [];
        return (
          <div key={s.sourceId} className="mt-3 rounded-2xl bg-vio-soft p-4 text-sm leading-relaxed">
            <p className="flex flex-wrap items-center gap-1.5 font-bold text-vio">
              AI 서술 판정 · {j.level === null ? "판단 불가" : `레벨 ${j.level}`}
              {demo && <Badge tone="violet" className="bg-white">데모 판정</Badge>}
              {j.borderline && <Badge tone="amber">경계 사례 · 낮은 레벨로 판정</Badge>}
              {j.flagged && <Badge tone="red">서술 안에 지시문 의심 · 확인 필요</Badge>}
            </p>
            {j.level !== null && <p className="mt-1.5 text-sub">기준 · {levels.find((l) => l.level === j.level)?.criterion}</p>}
            {j.quotes.map((q, i) => <blockquote key={i} className="mt-1.5 border-l-[3px] border-vio/40 pl-3 text-ink">“{q}”</blockquote>)}
            <p className="mt-1.5 text-sub">{j.reason}</p>
            {j.adjacentReason && <p className="text-mute">{j.adjacentReason}</p>}
          </div>
        );
      })}
    </>
  );
}

function CompetencyDetail({ result, student, run, onClose }: { result: CompetencyResult; student: RunStudent; run: RunResult; onClose: () => void }) {
  const rubric = run.rubricBody;
  return (
    <Modal open wide onClose={onClose} title={<span className="flex items-center gap-2">{result.name} <GradeBadge result={result} large /></span>} subtitle={`${student.name} · ${result.group}`}>
      <div className="space-y-6">
        <div className="flex items-end gap-5 rounded-3xl bg-soft p-6">
          <span className="text-5xl">{faceOf(result.score)}</span>
          <div className="flex-1">
            <p className="text-[40px] font-bold leading-none tracking-tight tabular-nums">{result.hold ? "보류" : result.score}<span className="ml-1 text-lg font-semibold text-mute">{result.hold ? "" : "점"}</span></p>
            <div className="mt-3"><ScoreBar score={result.score} color={VIO} ticks={rubric.settings.grades.map((g) => g.min).filter((m) => m > 0 && m < 100)} className="h-2.5" /></div>
          </div>
          <div className="space-y-1 text-right text-sm text-sub">
            <p>데이터 충족도 <b className="font-bold text-ink tabular-nums">{result.coverage}%</b></p>
            {result.reliability && <p>신뢰도 <b className="font-bold text-ink">{result.reliability}</b></p>}
          </div>
        </div>
        {result.hold && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[15px] font-medium leading-relaxed text-warn">평가할 자료가 기준({rubric.settings.holdThreshold}%)보다 부족해서 등급을 내지 않았어요. 자료가 없다고 낮은 점수를 준 것이 아니에요.</p>}

        <section className="space-y-3">
          <h3 className="text-[17px] font-bold">어떻게 평가했나요</h3>
          {result.items.map((item) => (
            <div key={item.itemId} className="rounded-2xl border border-line p-4">
              <div className="flex items-start gap-3">
                <p className="flex flex-1 flex-wrap items-center gap-1.5 text-[16px] font-bold">{item.name}{item.kind === "bonus" && <Badge tone="green">가점</Badge>}</p>
                {item.status === "scored"
                  ? <p className="text-right text-[15px] tabular-nums"><b className="text-lg font-bold">{item.score}</b>점 <span className="text-mute">× {item.weight}{item.kind === "bonus" ? "점" : "%"} → {item.contribution}</span></p>
                  : <Badge tone="amber">계산에서 제외</Badge>}
              </div>
              <ul className="mt-3 space-y-2.5">
                {item.sources.map((s) => (
                  <li key={s.sourceId} className="flex gap-3 text-sm leading-relaxed">
                    <span className={`mt-0.5 flex h-6 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ${s.status === "scored" ? "bg-brand-soft text-brand" : "bg-fill text-mute"}`}>{s.score ?? "–"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.label} <span className="font-normal text-mute">{METHOD_LABEL[s.method]}</span></p>
                      {s.method !== "narrative" && <p className="text-sub">{s.data}</p>}
                      <p className={s.status === "scored" ? "text-mute" : "text-warn"}>{s.status === "scored" ? s.rule : `${REASON_TEXT[s.reason ?? ""] ?? s.reason}${s.rule ? ` · ${s.rule}` : ""}`}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <QualCard item={item} qual={student.qual} rubric={rubric} competencyId={result.competencyId} demo={run.ai.demo ?? false} />
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-soft p-4 text-sm leading-relaxed">
          <p className="mb-1 flex items-center gap-2 font-bold">계산식 <Badge tone={result.checksumOk ? "green" : "red"}>{result.checksumOk ? "검산 일치" : "검산 불일치"}</Badge></p>
          <p className="break-words tabular-nums text-sub">{result.formula}{result.score !== null && ` → 반올림 ${result.score}점`}</p>
          {result.adjustments.map((a) => <p key={a.label} className="text-sub">조정 · {a.label} {a.amount > 0 ? "+" : ""}{a.amount}</p>)}
          {result.missing.length > 0 && <p className="mt-2 text-mute">데이터를 등록하면 평가되는 항목 · {result.missing.join(" / ")}</p>}
        </section>
      </div>
    </Modal>
  );
}

function Report({ student, index, run, group, groups, onGroup }: { student: RunStudent; index: number; run: RunResult; group: string; groups: string[]; onGroup: (g: string) => void }) {
  const [detail, setDetail] = useState<string | null>(null);
  const all = student.evaluation.competencies;
  const scored = [...graded(student)].sort((a, b) => (b.score as number) - (a.score as number));
  const holds = all.filter((c) => c.hold);
  const average = averageOf(student);
  const top = scored[0];
  const low = scored[scored.length - 1];
  const inGroup = all.filter((c) => c.group === group);
  const ticks = run.rubricBody.settings.grades.map((g) => g.min).filter((m) => m > 0 && m < 100);
  const profile = [student.profile?.department, student.profile?.year && `${student.profile.year}학년`].filter(Boolean).join(" · ");
  const sliders = groups.length > 1
    ? groups.map((g) => ({ label: g || "기타", value: mean(all.filter((c) => c.group === g && !c.hold).map((c) => c.score as number)) }))
    : scored.slice(0, 5).map((c) => ({ label: c.name, value: c.score }));
  const detailResult = all.find((c) => c.competencyId === detail);

  return (
    <div className="space-y-5" key={student.submissionId}>
      {/* 페르소나 카드 */}
      <section className="relative mt-14 animate-rise rounded-[32px] bg-white px-6 pb-7 pt-6 shadow-card sm:px-8">
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[150px_1fr_300px]">
          <div>
            <Avatar name={student.name} studentId={student.studentId} index={index} cutout className="-mt-20 h-36 w-36 text-6xl" />
            <p className="mt-4 text-xs font-bold text-mute">Profile</p>
            <p className="mt-1 text-xl font-bold">{student.name}</p>
            {profile && <p className="text-sm text-sub">{profile}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
              {average !== null && <span className="rounded-lg bg-vio-soft px-3 py-1.5 text-sm font-bold text-vio">평균 {average}점</span>}
              <span className="rounded-lg bg-vio-soft px-3 py-1.5 text-sm font-bold text-vio">{scored.filter((c) => (c.score as number) >= 80).length}개 역량 80점↑</span>
              {holds.length > 0 && <span className="rounded-lg bg-fill px-3 py-1.5 text-sm font-bold text-sub">판정 보류 {holds.length}개</span>}
            </div>
          </div>

          <div className="min-w-0">
            <div className="relative rounded-3xl bg-soft px-6 py-5">
              <span className="absolute -left-2 top-8 hidden h-4 w-4 rotate-45 bg-soft lg:block" />
              {top ? (
                <p className="text-[21px] font-bold leading-snug tracking-tight text-vio">
                  <span className="mr-1 text-faint">“</span>{top.name} 역량이 가장 돋보여요
                  {low && low !== top && <><br />{low.name}{topicParticle(low.name)} 조금 더 채워 볼 수 있어요</>}<span className="ml-1 text-faint">”</span>
                </p>
              ) : <p className="text-[19px] font-bold text-sub">아직 평가할 자료가 부족해요</p>}
            </div>
            <p className="mb-1.5 mt-5 text-sm font-bold">Summary</p>
            <p className="text-[15px] leading-[1.75] text-sub">
              전체 {all.length}개 역량 가운데 {scored.length}개를 평가했어요.
              {average !== null && <> 평균은 <b className="font-bold text-ink">{average}점</b>이고,</>}
              {top && <> 가장 높은 역량은 <b className="font-bold text-ink">{top.name}({top.score}점)</b>{low && low !== top ? <>, 가장 낮은 역량은 <b className="font-bold text-ink">{low.name}({low.score}점)</b>이에요.</> : "이에요."}</>}
              {holds.length > 0 && <> {holds.length}개 역량은 자료가 부족해 판정을 보류했어요. 낮은 점수를 준 것이 아니에요.</>}
            </p>
          </div>

          <div className="rounded-3xl bg-soft p-6">
            <p className="mb-4 text-sm font-bold">{groups.length > 1 ? "구분별 평균" : "상위 역량"}</p>
            <div className="space-y-5">{sliders.map((s) => <Slider key={s.label} {...s} />)}</div>
          </div>
        </div>

        <div className="mt-7 grid gap-6 border-t border-fill pt-6 md:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[15px] font-bold">Strength <span className="ml-1 font-semibold text-mute">강점</span></p>
            {student.feedback.strengths.length === 0 ? <p className="text-sm text-mute">80점 이상인 항목이 아직 없어요.</p> : (
              <ul className="space-y-2">
                {student.feedback.strengths.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-vio" /><span><b className="font-bold">{f.competency} · {f.item}</b><br /><span className="text-sub">{f.text}</span></span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2.5 text-[15px] font-bold">Painpoint <span className="ml-1 font-semibold text-mute">아쉬운 점</span></p>
            {student.feedback.improvements.length === 0 ? <p className="text-sm text-mute">70점 미만인 항목이 없어요.</p> : (
              <ul className="space-y-2">
                {student.feedback.improvements.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-vio" /><span><b className="font-bold">{f.competency} · {f.item}</b><br /><span className="text-sub">{f.text.split(/(?<=\))\.\s/)[0]}</span></span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 역량 흐름 */}
      <Card className="animate-rise p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight">역량 흐름</h2>
            <p className="mt-1 text-sm text-sub">점수가 높은 역량부터 낮은 역량 순서예요. 얼굴을 누르면 계산 근거가 열려요.</p>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-mute">{[[95, "90↑"], [85, "80↑"], [75, "70↑"], [65, "60↑"], [50, "60↓"], [null, "보류"]].map(([score, text]) => <span key={text}>{faceOf(score as number | null)} {text}</span>)}</p>
        </div>
        <MoodCurve points={[...scored, ...holds].map((c) => ({ id: c.competencyId, name: c.name, score: c.score, grade: c.grade }))} onSelect={setDetail} />

        {student.feedback.improvements.length > 0 && (
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {student.feedback.improvements.map((f, i) => {
              const [now, step] = f.text.split(/(?<=\))\.\s/);
              return (
                <div key={i} className="flex flex-col rounded-2xl bg-soft p-5 text-sm leading-relaxed">
                  <p className="text-xs font-bold text-mute">Painpoint</p>
                  <p className="mt-1 font-bold">{f.competency} · {f.item}</p>
                  <p className="text-sub">{now}</p>
                  <p className="my-2 text-center text-vio">⋮<br />▾</p>
                  <p className="text-xs font-bold text-vio">Solution</p>
                  <p className="mt-1 font-semibold text-vio">{step || "이 항목의 근거 데이터를 더 쌓으면 점수가 올라요."}</p>
                </div>
              );
            })}
          </div>
        )}
        {student.feedback.toRegister.length > 0 && <p className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium leading-relaxed text-warn">판정 보류된 역량은 이 자료를 등록하면 평가돼요 · {student.feedback.toRegister.join(", ")}</p>}
      </Card>

      {/* 역량 지도 */}
      <Card className="animate-rise p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-xl font-bold tracking-tight">역량 지도</h2>
          {groups.length > 1 && <Segmented value={group} onChange={onGroup} options={groups.map((g) => ({ value: g, label: g || "기타" }))} />}
        </div>
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Radar axes={inGroup.map((c) => c.name)} series={[{ name: student.name, color: "#6b5ce7", values: inGroup.map((c) => c.score) }]} size={270} />
          <ul>
            {inGroup.map((c) => (
              <li key={c.competencyId}>
                <button type="button" onClick={() => setDetail(c.competencyId)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-soft">
                  <span className="text-2xl">{faceOf(c.score)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[15px] font-bold"><span className="truncate">{c.name}</span><GradeBadge result={c} /></p>
                    <ScoreBar score={c.score} color={VIO} ticks={ticks} />
                  </div>
                  <span className="w-12 text-right text-lg font-bold tabular-nums">{c.hold ? <span className="text-sm text-mute">보류</span> : c.score}</span>
                  <span className="text-lg text-faint">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {student.unusedCategories.length > 0 && <p className="mt-5 border-t border-fill pt-4 text-sm text-mute">이번 기준에서 쓰지 않은 데이터 · {student.unusedCategories.join(", ")}</p>}
      </Card>

      {detailResult && <CompetencyDetail result={detailResult} student={student} run={run} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Compare({ run, group, groups, onGroup, onOpen }: { run: RunResult; group: string; groups: string[]; onGroup: (g: string) => void; onOpen: (index: number) => void }) {
  const students = run.students;
  const [slots, setSlots] = useState<(string | null)[]>(() => [0, 1, 2].map((i) => students[i]?.submissionId ?? null));
  const columns = run.rubricBody.competencies.filter((c) => c.group === group);
  const results = students.flatMap((s) => s.evaluation.competencies);
  const scored = results.filter((c) => !c.hold);
  const byCompetency = run.rubricBody.competencies
    .map((c) => ({ name: c.name, average: mean(scored.filter((r) => r.competencyId === c.id).map((r) => r.score as number)) }))
    .filter((c): c is { name: string; average: number } => c.average !== null)
    .sort((a, b) => b.average - a.average);
  // 절반 넘게 보류된 대상자는 평균이 몇 개 역량만으로 정해지므로 순위에서 빼고 맨 아래에 둔다
  const ranking = students
    .map((s, index) => { const holds = s.evaluation.competencies.length - graded(s).length; return { s, index, average: averageOf(s), holds, thin: holds * 2 > s.evaluation.competencies.length }; })
    .sort((a, b) => Number(a.thin) - Number(b.thin) || (b.average ?? -1) - (a.average ?? -1));
  const grades = [...run.rubricBody.settings.grades].sort((a, b) => b.min - a.min).map((g) => ({ label: g.grade, count: scored.filter((c) => c.grade === g.grade).length, hold: false }));
  const distribution = [...grades, { label: "보류", count: results.length - scored.length, hold: true }];
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));
  const toggle = (id: string) => setSlots((prev) => {
    if (prev.includes(id)) return prev.map((x) => (x === id ? null : x));
    const free = prev.indexOf(null);
    return free < 0 ? prev : prev.map((x, i) => (i === free ? id : x));
  });
  const series = slots.map((id, slot) => ({ student: students.find((s) => s.submissionId === id), color: SERIES_COLORS[slot] })).filter((x): x is { student: RunStudent; color: string } => Boolean(x.student));
  const tiles = [
    { label: "평가 인원", value: `${students.length}명` },
    { label: "전체 평균", value: mean(scored.map((c) => c.score as number)) === null ? "–" : `${mean(scored.map((c) => c.score as number))}점` },
    { label: "가장 높은 역량", value: byCompetency[0]?.name ?? "–", note: byCompetency[0] && `평균 ${byCompetency[0].average}점` },
    { label: "가장 낮은 역량", value: byCompetency[byCompetency.length - 1]?.name ?? "–", note: byCompetency.length > 0 ? `평균 ${byCompetency[byCompetency.length - 1].average}점` : undefined },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={t.label} className="animate-rise p-6"><div style={{ animationDelay: `${i * 50}ms` }}>
            <p className="text-sm font-semibold text-mute">{t.label}</p>
            <p className="mt-1.5 truncate text-[26px] font-bold tracking-tight">{t.value}</p>
            {t.note && <p className="text-sm text-sub">{t.note}</p>}
          </div></Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="animate-rise p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight">평균 점수 순위</h2>
          <p className="mt-1 text-sm text-sub">평가된 역량의 평균이에요. 보류된 역량은 평균에서 빠져요.</p>
          <ul className="mt-5 space-y-1">
            {ranking.map(({ s, index, average, holds, thin }, rank) => (
              <li key={s.submissionId}>
                <button type="button" onClick={() => onOpen(index)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-soft">
                  <span className="w-5 text-center text-sm font-bold text-mute">{thin ? "–" : rank + 1}</span>
                  <Avatar name={s.name} studentId={s.studentId} index={index} className="h-10 w-10 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 flex items-baseline gap-2 text-[15px] font-bold">{s.name}{holds > 0 && <span className={`text-xs font-medium ${thin ? "text-warn" : "text-mute"}`}>{thin ? `자료 부족 · ${holds}개 보류라 순위에서 뺐어요` : `보류 ${holds}개`}</span>}</p>
                    <ScoreBar score={thin ? null : average} className="h-2.5" />
                  </div>
                  <span className={`w-10 text-right text-lg font-bold tabular-nums ${thin ? "text-faint" : ""}`}>{average ?? "–"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex animate-rise flex-col p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight">등급 분포</h2>
          <p className="mt-1 text-sm text-sub">모든 대상자 × 역량 결과 {results.length}건</p>
          <div className="mt-6 flex flex-1 items-end gap-2" style={{ minHeight: 180 }}>
            {distribution.map((d) => (
              <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.label} ${d.count}건`}>
                <span className="text-sm font-bold tabular-nums">{d.count}</span>
                <div className="w-full max-w-12 rounded-t-[4px]" style={{ height: `${(d.count / maxCount) * 78}%`, minHeight: d.count ? 4 : 0, background: d.hold ? "#d1d6db" : "var(--color-brand)" }} />
                <span className="text-sm font-semibold text-sub">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="animate-rise p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight">한눈에 비교</h2>
            <p className="mt-1 text-sm text-sub">색이 짙을수록 점수가 높아요. 이름을 누르면 개별 리포트로 가요.</p>
          </div>
          {groups.length > 1 && <Segmented value={group} onChange={onGroup} options={groups.map((g) => ({ value: g, label: g || "기타" }))} />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-center">
            <thead><tr><th />{columns.map((c) => <th key={c.id} className="px-1 pb-1.5 align-bottom text-xs font-semibold leading-tight text-sub">{c.name}</th>)}</tr></thead>
            <tbody>
              {students.map((s, index) => (
                <tr key={s.submissionId}>
                  <td className="pr-3"><button type="button" onClick={() => onOpen(index)} className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold hover:text-brand"><Avatar name={s.name} studentId={s.studentId} index={index} className="h-8 w-8 text-sm" />{s.name}</button></td>
                  {columns.map((col) => {
                    const c = s.evaluation.competencies.find((x) => x.competencyId === col.id);
                    return <td key={col.id} className="h-11 min-w-16 rounded-[10px] text-[15px] font-bold tabular-nums" style={heatColor(c?.score ?? null)} title={c ? `${s.name} · ${c.name} · ${c.hold ? `판정 보류 (충족도 ${c.coverage}%)` : `${c.score}점 ${c.grade}등급`}` : ""}>{!c || c.hold ? "보류" : c.score}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-mute">
          낮음 <span className="flex overflow-hidden rounded">{HEAT_LEGEND.map((c) => <span key={c} className="h-3 w-6" style={{ background: c }} />)}</span> 높음
          <span className="ml-3 h-3 w-6 rounded" style={{ background: HOLD_COLOR }} /> 판정 보류
        </div>
      </Card>

      {columns.length >= 3 && (
        <Card className="animate-rise p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight">겹쳐 보기</h2>
          <p className="mt-1 text-sm text-sub">세 명까지 골라 역량 모양을 겹쳐 볼 수 있어요.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {students.map((s, index) => {
              const slot = slots.indexOf(s.submissionId);
              const full = slot < 0 && !slots.includes(null);
              return (
                <button key={s.submissionId} type="button" disabled={full} onClick={() => toggle(s.submissionId)} aria-pressed={slot >= 0} className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition ${slot >= 0 ? "bg-ink text-white" : "bg-fill text-sub hover:bg-line disabled:opacity-40"}`}>
                  <Avatar name={s.name} studentId={s.studentId} index={index} className="h-7 w-7 text-xs" />
                  {slot >= 0 && <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: SERIES_COLORS[slot] }} />}
                  {s.name}
                </button>
              );
            })}
          </div>
          {series.length > 0 && <Radar axes={columns.map((c) => c.name)} size={320} series={series.map(({ student, color }) => ({ name: student.name, color, values: columns.map((col) => student.evaluation.competencies.find((c) => c.competencyId === col.id)?.score ?? null) }))} />}
        </Card>
      )}
    </div>
  );
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunResult | null>(null);
  const [view, setView] = useState<"report" | "compare">("report");
  const [selected, setSelected] = useState(0);
  const [group, setGroup] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ run: RunResult }>(`/api/runs/${id}`).then((d) => { setRun(d.run); setView(d.run.students.length > 1 ? "compare" : "report"); }).catch(setError);
  }, [id]);

  if (!run) return error ? <ErrorNote error={error} /> : <p className="py-20 text-center text-mute">불러오는 중…</p>;
  const groups = [...new Set(run.rubricBody.competencies.map((c) => c.group))];
  const activeGroup = group !== null && groups.includes(group) ? group : groups[0];
  const student = run.students[selected];
  const many = run.students.length > 1;

  return (
    <div className="space-y-6">
      <div className="[&>div]:mb-0"><StepBack back={{ href: "/students", label: "대상자 데이터" }} /></div>
      <header className="relative animate-rise overflow-hidden rounded-[32px] bg-gradient-to-br from-[#7b6cf6] via-[#8e8cf9] to-[#a9c8ff] px-7 py-8 text-white sm:px-9">
        <span className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <span className="absolute -bottom-24 right-32 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm font-bold opacity-90">Result {run.ai.demo && <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px]">데모 · AI 미연결</span>}</p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight">{many ? `${run.students.length}명의 역량 평가 결과` : `${student?.name ?? ""}님의 역량 평가 결과`}</h1>
            <p className="mt-2 text-[15px] opacity-90">{run.rubric.name} {run.rubric.version} · {formatTime(run.executedAt)}</p>
          </div>
          <button type="button" onClick={() => setExporting(true)} className="h-11 rounded-xl bg-white/20 px-4 text-[15px] font-semibold backdrop-blur transition hover:bg-white/30">내보내기</button>
        </div>
      </header>

      {run.excluded.map((e) => <p key={e.name} className="rounded-2xl bg-bad-soft px-5 py-3.5 text-[15px] font-medium text-bad">{e.name} · {e.reason}</p>)}
      {run.students.length === 0 && <Card className="p-10 text-center text-sub">평가된 대상자가 없어요. <Link href="/students" className="font-semibold text-brand">대상자 데이터</Link>를 확인해 주세요.</Card>}

      {many && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={view} onChange={setView} options={[{ value: "compare", label: "전체 비교" }, { value: "report", label: "개별 리포트" }]} />
          {view === "report" && (
            <div className="flex flex-1 gap-2 overflow-x-auto py-1">
              {run.students.map((s, i) => (
                <button key={s.submissionId} type="button" onClick={() => setSelected(i)} className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition ${i === selected ? "bg-vio text-white" : "bg-white text-sub shadow-card hover:text-ink"}`}>
                  <Avatar name={s.name} studentId={s.studentId} index={i} className="h-7 w-7 text-xs" />{s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "compare" && many && <Compare run={run} group={activeGroup} groups={groups} onGroup={setGroup} onOpen={(i) => { setSelected(i); setView("report"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      {(view === "report" || !many) && student && <Report student={student} index={selected} run={run} group={activeGroup} groups={groups} onGroup={setGroup} />}

      <Modal open={exporting} onClose={() => setExporting(false)} title="결과 내보내기" subtitle="점수, 등급, 항목별 근거와 계산식이 모두 들어 있어요">
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={`/api/runs/${id}/export`} className={buttonClass("soft", "lg")}>엑셀 파일</a>
          <a href={`/api/runs/${id}/export?format=json`} className={buttonClass("secondary", "lg")}>JSON 파일</a>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-mute">{run.ai.used ? `AI 서술 판정 모델 ${run.ai.model} · 프롬프트 ${run.ai.judgePrompt}` : "AI가 연결되지 않아 서술 판정은 데모 규칙으로 대신했어요. 숫자·목록 항목의 점수는 올린 데이터로 실제 계산한 값이에요."}</p>
        <div className="mt-4 flex justify-end"><Button onClick={() => setExporting(false)}>닫기</Button></div>
      </Modal>
    </div>
  );
}
