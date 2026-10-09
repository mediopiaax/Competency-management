"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Badge, Button, buttonClass, Card, ErrorNote, formatTime, inputClass, Modal, sendJson } from "@/components/ui";

interface Workspace { id: string; kind: "institution" | "student"; name: string }
interface Overview {
  aiAvailable: boolean;
  counts: { lists: number; drafts: number; confirmed: number; submissions: number; runs: number };
  audit: { at: string; action: string; detail: string }[];
}

const KINDS: { value: Workspace["kind"]; emoji: string; title: string; text: string }[] = [
  { value: "institution", emoji: "🏫", title: "기관", text: "여러 명을 한 번에 평가하고 비교해요" },
  { value: "student", emoji: "🙋", title: "학생", text: "내 역량 상태를 스스로 점검해요" },
];

const FEATURES = [
  { title: "역량 입력", text: "우리 기관이 중요하게 생각하는 역량을 정해요.", icon: <><path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="M11 6h10M11 12h10M4 18h17" /></> },
  { title: "AI 평가체계 설계", text: "역량에 맞는 평가 항목과 기준을 구성해요.", icon: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /><path d="M7 11v4a2 2 0 0 0 2 2h4" /></> },
  { title: "평가 진행 및 결과 확인", text: "설계한 기준에 따라 평가하고 결과를 확인해요.", icon: <><path d="M4 20v-5M9 20v-8M14 20v-6M19 20V9" /><path d="m3 10 6-5 4 3 7-5" /></> },
];

export default function Home() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [kind, setKind] = useState<Workspace["kind"]>("institution");
  const [name, setName] = useState("");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ workspaces: Workspace[]; current: Workspace | null }>("/api/workspaces")
      .then(async (data) => {
        const summary = data.current ? await api<Overview>("/api/overview") : null;
        setWorkspaces(data.workspaces);
        setCurrent(data.current);
        setOverview(summary);
      })
      .catch(setError)
      .finally(() => setLoaded(true));
  }, []);

  const create = () => sendJson("/api/workspaces", { kind, name }).then(() => router.push("/competencies")).catch(setError);
  const leave = () => api("/api/workspaces", { method: "DELETE" }).then(() => window.location.reload()).catch(setError);
  const choose = (id: string) => sendJson("/api/workspaces", { id }, "PUT").then(() => window.location.reload()).catch(setError);

  const steps = overview && [
    { href: "/competencies", emoji: "📝", name: "역량 입력", state: overview.counts.lists > 0 ? `${overview.counts.lists}개 목록` : "아직 없음", done: overview.counts.lists > 0 },
    { href: "/rubrics", emoji: "📐", name: "평가기준표", state: overview.counts.confirmed > 0 ? `확정 ${overview.counts.confirmed}개` : overview.counts.drafts > 0 ? "초안 작성 중" : "아직 없음", done: overview.counts.confirmed > 0 },
    { href: "/students", emoji: "👥", name: "대상자 데이터", state: overview.counts.submissions > 0 ? `${overview.counts.submissions}명` : "아직 없음", done: overview.counts.submissions > 0 },
    { href: "/evaluate", emoji: "📊", name: "평가 결과", state: overview.counts.runs > 0 ? `${overview.counts.runs}회 평가` : "아직 없음", done: overview.counts.runs > 0 },
  ];
  const next = steps?.find((s) => !s.done) ?? steps?.[3];

  const form = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button key={k.value} type="button" onClick={() => setKind(k.value)} className={`rounded-2xl border-2 p-5 text-left transition ${kind === k.value ? "border-brand bg-brand-soft" : "border-transparent bg-fill hover:bg-line"}`}>
            <span className="text-3xl">{k.emoji}</span>
            <p className="mt-2 text-[17px] font-bold">{k.title}</p>
            <p className="mt-0.5 text-sm text-sub">{k.text}</p>
          </button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }} placeholder={kind === "student" ? "이름 또는 별칭" : "기관 이름 (예: ○○대학교)"} className={`${inputClass} h-14 w-full text-[17px]`} />
      <Button variant="primary" size="lg" className="w-full" disabled={name.trim() === ""} onClick={create}>시작하기</Button>
    </div>
  );

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <ErrorNote error={error} />

      {!current ? (
        <div className="grid items-start gap-5 pt-2 lg:grid-cols-[1.25fr_1fr]">
          <Card className="animate-rise p-8 sm:p-10">
            <h1 className="text-[40px] font-bold leading-[1.3] tracking-tight sm:text-[46px]">역량만 입력하면,<br /><span className="text-brand">평가까지 한 번에.</span></h1>
            <p className="mt-5 text-[18px] leading-relaxed text-sub">기관마다 다른 역량 기준. AI가 평가체계 설계부터 실제 평가까지 이어드려요.</p>
            <ul className="mt-8 space-y-6 border-t border-line pt-8">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{f.icon}</svg>
                  <div>
                    <p className="text-[19px] font-semibold">{f.title}</p>
                    <p className="mt-1 text-[16px] text-mute">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-5">
          <Card className="animate-rise p-7">
            <p className="mb-4 text-lg font-bold">누가 사용하나요?</p>
            {form}
          </Card>
          {workspaces.length > 0 && (
            <Card className="animate-rise p-3">
              <p className="px-4 pb-1 pt-3 text-sm font-semibold text-mute">이전에 쓰던 공간</p>
              {workspaces.map((ws) => (
                <button key={ws.id} type="button" onClick={() => choose(ws.id)} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-fill">
                  <span className="text-2xl">{ws.kind === "student" ? "🙋" : "🏫"}</span>
                  <span className="flex-1 text-[16px] font-semibold">{ws.name}</span>
                  <span className="text-faint">›</span>
                </button>
              ))}
            </Card>
          )}
          </div>
        </div>
      ) : (
        <>
          <header className="flex animate-rise flex-wrap items-end gap-4">
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" onClick={leave} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sub shadow-card hover:text-ink"><span aria-hidden>‹</span> 처음 화면으로</button>
                <button type="button" onClick={() => setSwitching(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sub shadow-card hover:text-ink">
                  {current.kind === "student" ? "🙋" : "🏫"} {current.name} <span className="text-faint">⌄</span>
                </button>
              </div>
              <h1 className="text-[28px] font-bold leading-[1.35] tracking-tight">{next && !next.done ? <>다음은 <span className="text-brand">{next.name}</span> 차례예요</> : "평가가 끝났어요. 결과를 확인해 보세요"}</h1>
            </div>
            {next && <Link href={next.href} className={buttonClass("primary", "lg")}>{next.done ? "결과 보기" : "이어서 하기"}</Link>}
          </header>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps!.map((step, i) => (
              <Link key={step.href} href={step.href} style={{ animationDelay: `${i * 60}ms` }} className={`group animate-rise rounded-3xl bg-white p-6 shadow-card transition hover:-translate-y-0.5 ${step === next && !step.done ? "ring-2 ring-brand" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{step.emoji}</span>
                  {step.done ? <Badge tone="blue">완료</Badge> : step === next ? <Badge tone="gray">지금 할 일</Badge> : null}
                </div>
                <p className="mt-5 text-xs font-bold text-mute">STEP {i + 1}</p>
                <p className="text-lg font-bold">{step.name}</p>
                <p className="mt-1 text-sm text-sub">{step.state}</p>
              </Link>
            ))}
          </div>

          {overview && !overview.aiAvailable && (
            <Card className="flex animate-rise items-start gap-4 p-6">
              <span className="text-2xl">🧪</span>
              <div>
                <p className="font-bold">데모 모드로 동작하고 있어요</p>
                <p className="mt-1 text-[15px] leading-relaxed text-sub">AI 키가 연결되지 않아 평가기준표 초안과 서술 판정을 데모용 규칙으로 대신 만들어요. 점수 계산은 올린 데이터로 실제 그대로 합니다.</p>
              </div>
            </Card>
          )}

          {overview && overview.audit.length > 0 && (
            <details className="animate-rise rounded-3xl bg-white shadow-card">
              <summary className="list-none px-6 py-5 text-[15px] font-semibold text-sub">최근 작업 기록 {overview.audit.length}건 <span className="text-faint">⌄</span></summary>
              <ul className="space-y-2 px-6 pb-6 text-sm">
                {overview.audit.map((a, i) => (
                  <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-mute">{formatTime(a.at)}</span><span className="w-36 shrink-0 font-semibold">{a.action}</span><span className="text-sub">{a.detail}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <Modal open={switching} onClose={() => setSwitching(false)} title="작업 공간" subtitle="역량·기준표·데이터·결과는 공간마다 따로 보관돼요">
        <div className="space-y-1">
          {workspaces.map((ws) => (
            <button key={ws.id} type="button" onClick={() => choose(ws.id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${ws.id === current?.id ? "bg-brand-soft" : "hover:bg-fill"}`}>
              <span className="text-2xl">{ws.kind === "student" ? "🙋" : "🏫"}</span>
              <span className="flex-1 text-[16px] font-semibold">{ws.name}</span>
              {ws.id === current?.id && <span className="font-bold text-brand">✓</span>}
            </button>
          ))}
        </div>
        <p className="mb-3 mt-6 text-[15px] font-bold">새로 만들기</p>
        {form}
      </Modal>
    </div>
  );
}
