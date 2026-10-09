"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Overview {
  workspace: { name: string; kind: string };
  aiAvailable: boolean;
  counts: { lists: number; drafts: number; confirmed: number; submissions: number; runs: number };
}

const STEPS = [
  { href: "/competencies", label: "역량 입력", match: ["/competencies"], done: (c: Overview["counts"]) => c.lists > 0 },
  { href: "/rubrics", label: "평가기준표", match: ["/rubrics"], done: (c: Overview["counts"]) => c.confirmed > 0 },
  { href: "/students", label: "대상자 데이터", match: ["/students"], done: (c: Overview["counts"]) => c.submissions > 0 },
  { href: "/evaluate", label: "평가 결과", match: ["/evaluate", "/results"], done: (c: Overview["counts"]) => c.runs > 0 },
];

export function Nav() {
  const pathname = usePathname();
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    fetch("/api/overview").then((r) => (r.ok ? r.json() : null)).then(setOverview).catch(() => setOverview(null));
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[17px] font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="hidden sm:inline">역량평가</span>
        </Link>

        {overview && (
          <ol className="mx-auto flex min-w-0 items-center overflow-x-auto">
            {STEPS.map((step, i) => {
              const active = step.match.some((m) => pathname.startsWith(m));
              const done = step.done(overview.counts);
              return (
                <li key={step.href} className="flex shrink-0 items-center">
                  {i > 0 && <span className="mx-1 h-px w-4 bg-line sm:mx-2 sm:w-7" />}
                  <Link href={step.href} className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-semibold transition ${active ? "bg-brand-soft text-brand" : "text-mute hover:text-ink"}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-brand text-white" : done ? "bg-brand-soft text-brand" : "bg-fill text-mute"}`}>{done && !active ? "✓" : i + 1}</span>
                    <span className={active ? "" : "hidden md:inline"}>{step.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        <Link href="/" className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-fill py-1.5 pl-3 pr-3.5 text-sm font-semibold text-sub hover:bg-line">
          {overview && !overview.aiAvailable && <span className="rounded-md bg-vio-soft px-1.5 py-0.5 text-[11px] font-bold text-vio">데모</span>}
          <span className="max-w-28 truncate">{overview ? overview.workspace.name : "시작하기"}</span>
        </Link>
      </nav>
    </header>
  );
}
