"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Badge, buttonClass, Card, EmptyState, ErrorNote, formatTime, PageTitle } from "@/components/ui";

interface Row { id: string; name: string; status: "draft" | "confirmed"; version: string | null; updatedAt: string; generatedBy: string; competencies: number }
const ORIGIN: Record<string, string> = { ai: "AI 초안", rules: "데모 초안", manual: "직접 수정" };

export default function RubricsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ rubrics: Row[] }>("/api/rubrics").then((r) => setRows(r.rubrics)).catch(setError);
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle step={2} back={{ href: "/competencies", label: "역량 입력" }} title="평가기준표">초안을 확인하고 고친 뒤 확정하면 그 버전으로 평가할 수 있어요. 확정본은 잠기고, 고치려면 새 버전을 만들어요.</PageTitle>
      <ErrorNote error={error} />

      {rows && rows.length === 0 && (
        <Card className="animate-rise">
          <EmptyState emoji="📐" title="아직 평가기준표가 없어요">
            <p>역량을 넣으면 AI가 초안을 만들어 줘요.</p>
            <Link href="/competencies" className={buttonClass("primary", "md", "mt-5")}>역량 입력하러 가기</Link>
          </EmptyState>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <>
          <Card className="animate-rise p-3">
            {rows.map((r) => (
              <Link key={r.id} href={`/rubrics/${r.id}`} className="flex items-center gap-4 rounded-2xl px-4 py-4 hover:bg-fill">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${r.status === "confirmed" ? "bg-brand-soft" : "bg-fill"}`}>{r.status === "confirmed" ? "🔒" : "✏️"}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[17px] font-bold"><span className="truncate">{r.name}</span>{r.status === "confirmed" ? <Badge tone="blue">확정 {r.version}</Badge> : <Badge tone="amber">초안</Badge>}</p>
                  <p className="mt-0.5 text-sm text-mute">역량 {r.competencies}개 · {ORIGIN[r.generatedBy]} · {formatTime(r.updatedAt)}</p>
                </div>
                <span className="text-xl text-faint">›</span>
              </Link>
            ))}
          </Card>
          <p className="text-center text-sm text-mute">다른 역량으로 새로 만들려면 <Link href="/competencies" className="font-semibold text-brand">역량 입력</Link>에서 시작하세요.</p>
        </>
      )}
    </div>
  );
}
