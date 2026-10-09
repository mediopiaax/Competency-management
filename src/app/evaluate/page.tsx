"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, buttonClass, Card, EmptyState, ErrorNote, formatTime, PageTitle } from "@/components/ui";

interface RunRow { id: string; createdAt: string; rubricName: string; version: string; students: number }

export default function EvaluatePage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ runs: RunRow[] }>("/api/runs").then((d) => setRuns(d.runs)).catch(setError);
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle step={4} back={{ href: "/students", label: "대상자 데이터" }} title="평가 결과">같은 데이터와 같은 기준표 버전이면 결과는 항상 같아요. 지난 평가도 그대로 다시 볼 수 있어요.</PageTitle>
      <ErrorNote error={error} />

      {runs && runs.length === 0 && (
        <Card className="animate-rise">
          <EmptyState emoji="📊" title="아직 평가한 적이 없어요">
            <p>대상자 데이터를 올리고 평가를 시작해 보세요.</p>
            <Link href="/students" className={buttonClass("primary", "md", "mt-5")}>대상자 데이터로 가기</Link>
          </EmptyState>
        </Card>
      )}

      {runs && runs.length > 0 && (
        <>
          <Link href={`/results/${runs[0].id}`} className="block animate-rise rounded-3xl bg-gradient-to-br from-[#7b6cf6] to-[#8fb4ff] p-7 text-white shadow-card transition hover:-translate-y-0.5">
            <p className="text-sm font-semibold opacity-80">가장 최근 평가 · {formatTime(runs[0].createdAt)}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{runs[0].students}명의 결과 리포트 보기 →</p>
            <p className="mt-1 text-[15px] opacity-85">{runs[0].rubricName} {runs[0].version}</p>
          </Link>

          {runs.length > 1 && (
            <Card className="animate-rise p-3">
              <p className="px-4 pb-1 pt-3 text-sm font-semibold text-mute">지난 평가</p>
              {runs.slice(1).map((r) => (
                <Link key={r.id} href={`/results/${r.id}`} className="flex items-center gap-4 rounded-2xl px-4 py-3.5 hover:bg-fill">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{r.rubricName} {r.version}</p>
                    <p className="text-sm text-mute">{formatTime(r.createdAt)} · {r.students}명</p>
                  </div>
                  <span className="text-xl text-faint">›</span>
                </Link>
              ))}
            </Card>
          )}
          <p className="text-center text-sm text-mute">다시 평가하려면 <Link href="/students" className="font-semibold text-brand">대상자 데이터</Link>에서 시작하세요.</p>
        </>
      )}
    </div>
  );
}
