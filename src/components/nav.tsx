"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/competencies", label: "1 역량 목록" },
  { href: "/rubrics", label: "2 채점기준표" },
  { href: "/students", label: "3 학생 데이터" },
  { href: "/evaluate", label: "4 평가·결과" },
];

export function Nav() {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<{ name: string; kind: string } | null>(null);
  useEffect(() => {
    fetch("/api/workspaces").then((r) => r.json()).then((d) => setWorkspace(d.current)).catch(() => setWorkspace(null));
  }, [pathname]);

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold text-slate-900">역량 평가</Link>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) || (link.href === "/evaluate" && pathname.startsWith("/results")) ? "font-medium text-blue-700" : "text-slate-600 hover:text-slate-900"}>
            {link.label}
          </Link>
        ))}
        <Link href="/" className="ml-auto text-slate-500 hover:text-slate-900">
          {workspace ? `${workspace.kind === "student" ? "학생" : "기관"} · ${workspace.name}` : "작업 공간 선택"}
        </Link>
      </nav>
    </header>
  );
}
