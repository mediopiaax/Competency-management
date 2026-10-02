"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Button, Card, ErrorNote, formatTime, PageTitle, sendJson } from "@/components/ui";

interface Workspace { id: string; kind: "institution" | "student"; name: string }
interface Overview {
  aiAvailable: boolean;
  counts: { lists: number; drafts: number; confirmed: number; submissions: number; runs: number };
  audit: { at: string; action: string; detail: string }[];
}

export default function Home() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [kind, setKind] = useState<Workspace["kind"]>("institution");
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ workspaces: Workspace[]; current: Workspace | null }>("/api/workspaces")
      .then(async (data) => {
        const summary = data.current ? await api<Overview>("/api/overview") : null;
        setWorkspaces(data.workspaces);
        setCurrent(data.current);
        setOverview(summary);
      })
      .catch(setError);
  }, []);

  const act = (promise: Promise<unknown>) => promise.then(() => window.location.reload()).catch(setError);

  const steps = overview && [
    { href: "/competencies", name: "역량 목록 올리기", state: `${overview.counts.lists}개 등록` , done: overview.counts.lists > 0 },
    { href: "/rubrics", name: "채점기준표 초안 만들고 수정·확정하기", state: `초안 ${overview.counts.drafts}개 · 확정 ${overview.counts.confirmed}개`, done: overview.counts.confirmed > 0 },
    { href: "/students", name: "학생 데이터 올리고 점검하기", state: `${overview.counts.submissions}명`, done: overview.counts.submissions > 0 },
    { href: "/evaluate", name: "평가 실행하고 결과 보기", state: `${overview.counts.runs}회 실행`, done: overview.counts.runs > 0 },
  ];

  return (
    <div className="space-y-8">
      <PageTitle title="역량 평가">
        역량 목록을 넣으면 채점기준표 초안을 만들고, 확인·수정해 확정한 기준표로 학생 데이터를 평가합니다. 기관과 학생 모두 같은 순서로 씁니다.
      </PageTitle>
      <ErrorNote error={error} />

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">작업 공간</h2>
        {current ? (
          <p className="text-sm">현재: <span className="font-medium">{current.kind === "student" ? "학생" : "기관"} · {current.name}</span></p>
        ) : (
          <p className="text-sm text-slate-600">먼저 작업 공간을 만드세요. 역량 목록·채점기준표·학생 데이터·결과는 작업 공간마다 따로 보관됩니다.</p>
        )}
        {workspaces.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {workspaces.map((ws) => (
              <Button key={ws.id} variant={ws.id === current?.id ? "primary" : "secondary"} onClick={() => act(sendJson("/api/workspaces", { id: ws.id }, "PUT"))}>
                {ws.kind === "student" ? "학생" : "기관"} · {ws.name}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <select value={kind} onChange={(e) => setKind(e.target.value as Workspace["kind"])} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="institution">기관 (여러 학생 평가)</option>
            <option value="student">학생 (본인 점검)</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "student" ? "이름 또는 별칭" : "기관 이름"} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <Button variant="primary" disabled={name.trim() === ""} onClick={() => act(sendJson("/api/workspaces", { kind, name }))}>새 작업 공간 만들기</Button>
        </div>
      </Card>

      {steps && (
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.href}>
              <Link href={step.href} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
                <span className="text-sm text-slate-400">{i + 1}</span>
                <span className="font-medium text-blue-700">{step.name}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${step.done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{step.state}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {overview && (
        <p className={`rounded-lg border px-4 py-3 text-sm ${overview.aiAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {overview.aiAvailable
            ? "AI가 연결되어 있습니다. 채점기준표 초안 생성과 서술 판정에 AI를 씁니다."
            : "AI 키가 없어 AI 없이 동작합니다. 채점기준표는 규칙 기반 기본 초안으로 만들고, 서술 판정 항목은 '판단 불가'로 계산에서 빠집니다. 프로젝트 폴더의 .env.local에 ANTHROPIC_API_KEY를 넣고 서버를 다시 켜면 AI를 씁니다."}
        </p>
      )}

      {overview && overview.audit.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">최근 작업 기록</h2>
          <ul className="space-y-1 text-sm">
            {overview.audit.map((a, i) => (
              <li key={i} className="flex gap-3"><span className="w-32 shrink-0 text-slate-400">{formatTime(a.at)}</span><span className="w-40 shrink-0 font-medium">{a.action}</span><span className="text-slate-600">{a.detail}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
