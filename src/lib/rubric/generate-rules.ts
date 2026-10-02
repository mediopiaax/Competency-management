import type { CompetencyInput } from "@/lib/competency/parse-list";
import { fieldIdOf, findField } from "./fields";
import { DEFAULT_LANGUAGE_TABLE } from "./language";
import { presetFor, type Preset } from "./presets";
import { DEFAULT_SETTINGS, type Competency, type Item, type Rubric } from "./types";

interface Pick {
  cat: number;
  label: string;
  filter?: { label: string; values: string[] };
}
const p = (cat: number, label: string, filter?: Pick["filter"]): Pick => ({ cat, label, filter });

/** 측정지표 문구 → 템플릿 데이터. AI 없이 만드는 기본 초안에만 쓴다. */
const KEYWORD_RULES: [RegExp, Pick[]][] = [
  [/노션|슬랙|협업 ?툴/, [p(21, "활용 수준")]],
  [/어학|TOEIC|토익|OPIc|외국어 능력|언어 사용/i, [p(26, "시험명"), p(18, "국제어 강의 이수 과목 수")]],
  [/외국어 수업|외국어 강의|국제어/, [p(18, "국제어 강의 이수 과목 수")]],
  [/교환학생|해외/, [p(17, "유형"), p(17, "기간(주)")]],
  [/유학생 봉사/, [p(23, "구분")]],
  [/봉사/, [p(23, "총 봉사시간(h)")]],
  [/학생회|동아리/, [p(22, "직책"), p(22, "기간(개월)")]],
  [/AI.*(경진|대회|프로젝트|공모전|캡스톤)|AI 코딩/i, [p(20, "주관 수준"), p(20, "명칭")]],
  [/AI\s*교육|생성형|바이브/i, [p(19, "이수 시간(h)"), p(19, "교육명")]],
  [/공모전|경진대회|수상/, [p(14, "결과"), p(14, "대회명")]],
  [/창업|사업자/, [p(15, "유형")]],
  [/특허/, [p(16, "진행 상태")]],
  [/퀴즈/, [p(5, "퀴즈 풀이 횟수(누적)")]],
  [/로그인/, [p(5, "주당 평균 로그인 횟수")]],
  [/출석/, [p(5, "출석률(%)")]],
  [/기한\s*준수/, [p(5, "과제 기한 준수율(%)")]],
  [/학습\s*계획|계획 달성/, [p(5, "학습계획 달성률(%)"), p(13, "진로 목표 설정 여부")]],
  [/면담/, [p(6, "교수 면담 횟수(누적)"), p(6, "학업상담 횟수(누적)")]],
  [/논문|보고서 작성/, [p(9, "게재 수준")]],
  [/발표 수업|발표/, [p(2, "과목 성적", { label: "수업유형", values: ["발표형"] })]],
  [/토론/, [p(2, "과목 성적", { label: "수업유형", values: ["토론형"] }), p(7, "토론방 게시글 수")]],
  [/과제 평가|보고서 평가|글쓰기 과제|과제 완성/, [p(2, "과제·보고서 점수", { label: "수업유형", values: ["과제·보고서형"] })]],
  [/(?<!어학 )자격증|컴퓨터활용|MOS|ADSP|SQLD|기사/, [p(27, "자격증명")]],
  [/비교과/, [p(30, "누적 이수시간(h)")]],
  [/융합 ?전공|복수 ?전공|연계 ?전공/, [p(3, "전공 구분")]],
  [/심화/, [p(3, "심화과목 이수 과목 수"), p(3, "전공 구분")]],
  [/연구|학회/, [p(8, "활동 유형"), p(8, "기간(개월)")]],
  [/팀 ?프로젝트|협업(?! ?툴)/, [p(25, "동료평가 점수"), p(8, "기간(개월)")]],
  [/아르바이트/, [p(12, "기간(개월)")]],
  [/인턴|현장실습|실무 경험/, [p(11, "기간(개월)"), p(11, "전공 관련성")]],
  [/전공 과목 성적|전공 지식|성적표/, [p(1, "전공 평점(누적)"), p(1, "전체 평점(누적)")]],
  [/스터디|멘토링|튜터/, [p(24, "유형"), p(24, "기간(개월)")]],
  [/조교|\bTA\b/, [p(10, "과목명")]],
];

const RARE_CATEGORIES = new Set([15, 16, 28]);

function resolve(pick: Pick): Preset | null {
  const preset = presetFor(fieldIdOf(pick.cat, pick.label));
  if (!preset) return null;
  if (pick.filter) preset.filter = { fieldId: fieldIdOf(pick.cat, pick.filter.label), values: pick.filter.values };
  return preset;
}
const signature = (s: Preset) => `${s.fieldId}|${s.filter?.values.join(",") ?? ""}`;

export function matchSources(text: string, used: Set<string>, limit = 3): Preset[] {
  const found: Preset[] = [];
  for (const [pattern, picks] of KEYWORD_RULES) {
    if (!pattern.test(text)) continue;
    for (const pick of picks) {
      const preset = resolve(pick);
      if (!preset || used.has(signature(preset)) || found.some((f) => signature(f) === signature(preset))) continue;
      found.push(preset);
    }
  }
  const chosen = found.slice(0, limit);
  chosen.forEach((s) => used.add(signature(s)));
  return chosen;
}

export function spreadWeights(count: number): number[] {
  if (count === 0) return [];
  const each = Math.floor(100 / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? 100 - each * (count - 1) : each));
}

export function generateCompetencyByRules(input: CompetencyInput, index: number): Competency {
  const id = `c${index + 1}`;
  const used = new Set<string>();
  const elements = input.elements.length > 0 ? input.elements : [{ name: input.name, description: input.description, indicators: "" }];
  const items: Item[] = [];
  const unmatched: string[] = [];
  const duplicated: string[] = [];

  for (const element of elements) {
    const text = element.indicators || `${element.name} ${element.description} ${input.name}`;
    const sources = items.length < 4 ? matchSources(text, used) : [];
    if (sources.length === 0) {
      if (matchSources(text, new Set()).length > 0) duplicated.push(element.name);
      else unmatched.push(element.name);
      continue;
    }
    items.push({
      id: `${id}-i${items.length + 1}`,
      name: element.name,
      description: element.description,
      weight: 0,
      kind: "basic",
      combine: "max",
      sources: sources.map((s, k) => ({ ...s, id: `${id}-i${items.length + 1}-s${k + 1}` })),
    });
  }

  for (const item of items) {
    const rare = item.sources.every((s) => RARE_CATEGORIES.has(findField(s.fieldId)!.category.no));
    if (rare && items.some((other) => other !== item && other.kind === "basic")) {
      item.kind = "bonus";
      item.weight = 10;
    }
  }
  const basic = items.filter((i) => i.kind === "basic");
  spreadWeights(basic.length).forEach((w, i) => (basic[i].weight = w));

  const measurability = items.length === 0 ? "하" : unmatched.length === 0 && items.length >= 2 ? "상" : "중";
  const note = [
    unmatched.length > 0 ? `템플릿 데이터로 측정하기 어려운 요소: ${unmatched.join(", ")}. 이 요소를 평가하려면 추가 데이터가 필요합니다.` : "",
    duplicated.length > 0 ? `${duplicated.join(", ")}: 앞 항목과 같은 데이터가 근거라서 항목을 따로 만들지 않았습니다(중복 가산 방지).` : "",
  ].filter(Boolean).join(" ");
  return { id, group: input.group, name: input.name, description: input.description, measurability, note, items };
}

export function generateRubricByRules(name: string, list: CompetencyInput[]): Rubric {
  return {
    name,
    generatedBy: "rules",
    settings: structuredClone(DEFAULT_SETTINGS),
    languageTable: structuredClone(DEFAULT_LANGUAGE_TABLE),
    competencies: list.map(generateCompetencyByRules),
  };
}
