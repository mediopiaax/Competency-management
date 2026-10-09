"use client";

import Link from "next/link";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

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

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const formatTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";
const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-line disabled:text-faint",
  secondary: "bg-fill text-sub hover:bg-line disabled:text-faint",
  soft: "bg-brand-soft text-brand hover:bg-[#d6e9ff] disabled:bg-fill disabled:text-faint",
  ghost: "text-sub hover:bg-fill disabled:text-faint",
  danger: "bg-bad-soft text-bad hover:bg-[#ffdfe1]",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 rounded-[10px] px-3 text-sm",
  md: "h-11 rounded-xl px-5 text-[15px]",
  lg: "h-14 rounded-2xl px-7 text-[17px]",
};
export const buttonClass = (variant: Variant = "secondary", size: Size = "md", className = "") =>
  `inline-flex shrink-0 items-center justify-center gap-1.5 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${className}`;

export function Button({ variant, size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white shadow-card ${className}`}>{children}</div>;
}

/** 홈과 이전 단계로 돌아가는 링크 줄. 단계 화면 맨 위에 둔다. */
export function StepBack({ back }: { back?: { href: string; label: string } }) {
  const link = "inline-flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-sm font-semibold text-sub shadow-card transition hover:text-ink";
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <Link href="/" className={link}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
        홈
      </Link>
      {back && <Link href={back.href} className={link}><span aria-hidden>‹</span> 이전 단계 · {back.label}</Link>}
    </div>
  );
}

/** 화면 맨 위 제목. step을 주면 "STEP n" 꼬리표와 홈·이전 단계 링크가 붙는다. */
export function PageTitle({ step, title, back, children }: { step?: number; title: ReactNode; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <header className="animate-rise">
      {step && <StepBack back={back} />}
      {step && <p className="mb-2 text-sm font-bold text-brand">STEP {step}</p>}
      <h1 className="text-[28px] font-bold leading-[1.35] tracking-tight">{title}</h1>
      {children && <p className="mt-2 text-[16px] leading-relaxed text-sub">{children}</p>}
    </header>
  );
}

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";
const TONE: Record<Tone, string> = {
  gray: "bg-fill text-sub",
  blue: "bg-brand-soft text-brand",
  green: "bg-good-soft text-good",
  amber: "bg-warn-soft text-warn",
  red: "bg-bad-soft text-bad",
  violet: "bg-vio-soft text-vio",
};
export function Badge({ tone = "gray", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ${TONE[tone]} ${className}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, className = "" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-fill p-1 ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`h-9 whitespace-nowrap rounded-[9px] px-3.5 text-sm font-semibold transition ${value === o.value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-sub"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const needsWorkspace = error instanceof ApiError && error.status === 401;
  return (
    <p className="animate-rise rounded-2xl bg-bad-soft px-5 py-4 text-[15px] font-medium text-bad">
      {error instanceof Error ? error.message : String(error)}
      {needsWorkspace && <Link href="/" className="ml-2 font-bold underline">처음 화면에서 시작하기</Link>}
    </p>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div className={`relative flex max-h-[92vh] w-full animate-pop flex-col rounded-t-[28px] bg-white shadow-pop sm:rounded-[28px] ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}>
        <div className="flex items-start gap-4 px-7 pb-3 pt-7">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-bold leading-snug tracking-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-[15px] text-sub">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-mute hover:bg-fill">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 pb-7 pt-2">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-7 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** 화면 아래에 붙는 다음 단계 버튼 영역 */
export function BottomBar({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1 text-[15px] text-sub">{hint}</div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-[3px] border-current border-r-transparent ${className}`} />;
}

/** 오래 걸리는 작업 동안 화면을 덮고 단계 문구를 차례로 보여준다 */
export function LoadingOverlay({ open, title, steps }: { open: boolean; title: string; steps: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), 900);
    return () => { clearInterval(timer); setIndex(0); };
  }, [open, steps.length]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex animate-fade flex-col items-center justify-center bg-white/95 px-6 text-center backdrop-blur">
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand"><Spinner className="h-8 w-8" /></span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{title}</p>
      <ul className="mt-6 space-y-2.5 text-left">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 text-[16px] transition-colors ${i < index ? "text-mute" : i === index ? "font-semibold text-ink" : "text-faint"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${i < index ? "bg-brand" : i === index ? "bg-brand/40" : "bg-line"}`}>{i < index ? "✓" : ""}</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 text-5xl">{emoji}</span>
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mt-2 text-[15px] text-sub">{children}</div>}
    </div>
  );
}

export const inputClass = "h-11 rounded-xl border border-transparent bg-fill px-3.5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-brand focus:bg-white disabled:text-mute";
