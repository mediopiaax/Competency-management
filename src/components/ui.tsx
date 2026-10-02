"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "요청을 처리하지 못했습니다", res.status, body);
  return body as T;
}
export const sendJson = <T,>(url: string, data: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const style = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return <button type="button" {...props} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${style} ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <p className="mt-2 text-slate-600">{children}</p>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const needsWorkspace = error instanceof ApiError && error.status === 401;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {error instanceof Error ? error.message : String(error)}
      {needsWorkspace && <Link href="/" className="ml-2 font-medium underline">처음 화면에서 작업 공간 선택하기</Link>}
    </p>
  );
}

export const formatTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
