import Link from "next/link";

const steps = [
  { name: "학생 데이터 업로드·점검", href: "/students", ready: true },
  { name: "채점기준표 계산 엔진", ready: false },
  { name: "역량 목록 업로드 · 채점기준표 초안 생성 · 편집", ready: false },
  { name: "서술 판정", ready: false },
  { name: "평가 결과", ready: false },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">역량 평가</h1>
        <p className="mt-2 text-slate-600">
          기관이나 학생이 역량 목록을 넣으면 채점기준표를 만들고, 확정한 기준표로 학생 데이터를 평가합니다.
        </p>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.name} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span className="text-sm text-slate-400">{i + 1}</span>
            {step.ready && step.href ? (
              <Link href={step.href} className="font-medium text-blue-700 hover:underline">{step.name}</Link>
            ) : (
              <span className="text-slate-500">{step.name}</span>
            )}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${step.ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
              {step.ready ? "사용 가능" : "준비 중"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
