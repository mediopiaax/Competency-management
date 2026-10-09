"use client";

import { useState } from "react";

/** 비교용 범주 색. 세 가지까지만 함께 쓴다(색각 이상 구분 검증을 통과한 조합). */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
/** 점수 크기를 나타내는 한 가지 색 농담(옅음 → 짙음) */
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#104281"];
export const HOLD_COLOR = "#f0efec";

export function heatColor(score: number | null): { background: string; color: string } {
  if (score === null) return { background: HOLD_COLOR, color: "#8b95a1" };
  const step = Math.min(RAMP.length - 1, Math.max(0, Math.floor((score - 40) / 10)));
  return { background: RAMP[step], color: step >= 3 ? "#ffffff" : "#104281" };
}
export const HEAT_LEGEND = RAMP;

export function faceOf(score: number | null): string {
  if (score === null) return "🫥";
  return score >= 90 ? "😆" : score >= 80 ? "😊" : score >= 70 ? "🙂" : score >= 60 ? "😐" : "😟";
}

/** 0~100 점수 막대. ticks는 등급 경계선 위치. */
export function ScoreBar({ score, color = "var(--color-brand)", ticks = [], className = "h-2" }: { score: number | null; color?: string; ticks?: number[]; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-full ${className}`} style={{ background: score === null ? HOLD_COLOR : "var(--color-fill)" }}>
      {score !== null && <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${score}%`, background: color }} />}
      {ticks.map((t) => <span key={t} className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${t}%` }} />)}
    </div>
  );
}

export interface RadarSeries { name: string; color: string; values: (number | null)[] }

export function Radar({ axes, series, size = 340 }: { axes: string[]; series: RadarSeries[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pad = 62;
  const full = size + pad * 2;
  const center = full / 2;
  const radius = size / 2;
  const n = axes.length;
  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [center + Math.cos(angle) * radius * (value / 100), center + Math.sin(angle) * radius * (value / 100)] as const;
  };
  const short = (s: string) => (s.length > 7 ? `${s.slice(0, 6)}…` : s);

  if (n < 3) return null;
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: full }}>
      <svg viewBox={`0 0 ${full} ${full}`} className="w-full" role="img" aria-label="역량별 점수 방사형 그래프">
        {[20, 40, 60, 80, 100].map((ring) => (
          <polygon key={ring} points={axes.map((_, i) => point(i, ring).join(",")).join(" ")} fill={ring === 100 ? "#f9fafb" : "none"} stroke="#e5e8eb" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 100);
          return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke={hover === i ? "#b0b8c1" : "#e5e8eb"} strokeWidth={1} />;
        })}
        {[20, 60, 100].map((ring) => <text key={ring} x={center + 4} y={center - radius * (ring / 100) + 11} fontSize={10} fill="#b0b8c1">{ring}</text>)}

        {series.map((s) => {
          const points = s.values.map((v, i) => (v === null ? null : point(i, v))).filter((p): p is readonly [number, number] => p !== null);
          return (
            <g key={s.name}>
              {points.length >= 3 && <polygon points={points.map((p) => p.join(",")).join(" ")} fill={s.color} fillOpacity={series.length > 1 ? 0.1 : 0.16} stroke={s.color} strokeWidth={2} strokeLinejoin="round" />}
              {s.values.map((v, i) => {
                if (v === null) return null;
                const [x, y] = point(i, v);
                return <circle key={i} cx={x} cy={y} r={hover === i ? 5.5 : 4} fill={s.color} stroke="#fff" strokeWidth={2} />;
              })}
            </g>
          );
        })}

        {axes.map((label, i) => {
          const dx = point(i, 100)[0] - center;
          const anchor = Math.abs(dx) < 8 ? "middle" : dx > 0 ? "start" : "end";
          const [lx, ly] = point(i, 100 + (14 / radius) * 100);
          const held = series.every((s) => s.values[i] === null);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle cx={lx} cy={ly} r={30} fill="transparent" />
              <text x={lx} y={ly + 4} textAnchor={anchor} fontSize={12.5} fontWeight={hover === i ? 700 : 500} fill={held ? "#b0b8c1" : hover === i ? "#191f28" : "#4e5968"}>{short(label)}</text>
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 min-w-36 -translate-x-1/2 -translate-y-1/2 animate-fade rounded-2xl bg-ink/90 px-4 py-3 text-white shadow-pop">
          <p className="mb-1.5 text-sm font-bold">{axes[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 text-[13px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 opacity-80">{s.name}</span>
              <span className="font-bold tabular-nums">{s.values[hover] === null ? "보류" : `${s.values[hover]}점`}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export interface CurvePoint { id: string; name: string; score: number | null; grade: string | null }

/** 점수가 높은 역량부터 낮은 역량까지 순서대로 이어 본 흐름. 얼굴은 점수대를 뜻한다. */
export function MoodCurve({ points, color = "var(--color-vio)", onSelect }: { points: CurvePoint[]; color?: string; onSelect?: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const scored = points.filter((p) => p.score !== null);
  const n = points.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (score: number) => 100 - score;
  const line = scored.map((p, i) => `${x(i)},${y(p.score as number)}`).join(" ");
  const height = 190;

  return (
    <div className="overflow-x-auto">
      <div className="pl-10" style={{ minWidth: n * 60 + 40 }}>
        <div className="relative" style={{ height }}>
          <span className="absolute -left-10 top-0 text-xs font-semibold text-vio">Good</span>
          <span className="absolute -left-10 bottom-0 text-xs font-semibold text-faint">Bad</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {[25, 50, 75].map((g) => <line key={g} x1={0} x2={100} y1={g} y2={g} stroke="#e5e8eb" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
            {scored.length > 1 && (
              <>
                <polygon points={`${x(0)},100 ${line} ${x(scored.length - 1)},100`} fill={color} fillOpacity={0.12} />
                <polyline points={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </>
            )}
          </svg>
          {points.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p.id)}
              aria-label={`${p.name} ${p.score === null ? "판정 보류" : `${p.score}점`}`}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[28px] leading-none transition-transform hover:scale-125"
              style={{ left: `${x(i)}%`, top: `${p.score === null ? 88 : Math.min(92, Math.max(8, y(p.score)))}%` }}
            >
              {faceOf(p.score)}
              {hover === i && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 animate-fade whitespace-nowrap rounded-xl bg-ink/90 px-3 py-1.5 text-[13px] font-semibold text-white">
                  {p.name} · {p.score === null ? "판정 보류" : `${p.score}점 ${p.grade}`}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-2 flex border-t border-line pt-2">
          {points.map((p, i) => (
            <span key={p.id} className={`flex-1 px-0.5 text-center text-xs leading-tight ${hover === i ? "font-bold text-ink" : "text-sub"}`}>{p.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
