import { fieldIdOf } from "./fields";
import type { Source } from "./types";

/** 근거 데이터별 기본 점수 기준. 초안에 들어가는 출발점이며 담당자가 수정한다. */
export type Preset = Omit<Source, "id">;

const base: Omit<Preset, "fieldId" | "method"> = {
  aggregate: "max", bonusPerExtra: 0, perSemester: false, bands: [], options: [], filter: null, multiplier: null, levels: [], undecidable: "",
};
const bands = (...pairs: [number, number][]) => pairs.map(([min, score]) => ({ min, score }));
const options = (...pairs: [string, number][]) => pairs.map(([value, score]) => ({ value, score }));

const presets = new Map<string, Preset>();
function range(cat: number, label: string, pairs: [number, number][], rest: Partial<Preset> = {}) {
  const fieldId = fieldIdOf(cat, label);
  presets.set(fieldId, { ...base, fieldId, method: "range", bands: bands(...pairs), ...rest });
}
function choice(cat: number, label: string, pairs: [string, number][], rest: Partial<Preset> = {}) {
  const fieldId = fieldIdOf(cat, label);
  presets.set(fieldId, { ...base, fieldId, method: "choice", options: options(...pairs), ...rest });
}

const GPA: [number, number][] = [[4, 100], [3.5, 85], [3, 70], [2.5, 55], [2, 40], [0, 20]];
const PERCENT: [number, number][] = [[95, 100], [90, 85], [80, 70], [70, 50], [0, 20]];
const PER_SEMESTER_VISITS: [number, number][] = [[1, 100], [0.5, 80], [0.25, 60], [0.01, 40], [0, 0]];
const COUNT3: [number, number][] = [[3, 100], [2, 80], [1, 60], [0, 0]];
const MONTHS: [number, number][] = [[12, 100], [6, 80], [3, 60], [1, 40], [0, 0]];
const LEVEL_FACTORS = { fieldId: "", factors: [{ value: "국제", factor: 1 }, { value: "전국", factor: 0.9 }, { value: "지역", factor: 0.8 }, { value: "교내", factor: 0.7 }] };

range(1, "전체 평점(누적)", GPA);
range(1, "전공 평점(누적)", GPA);
choice(2, "과목 성적", [["A+", 100], ["A0", 95], ["B+", 85], ["B0", 80], ["C+", 70], ["C0", 65], ["D+", 55], ["D0", 50], ["F", 0], ["P", 80]], { aggregate: "avg" });
range(2, "과제·보고서 점수", [[90, 100], [80, 85], [70, 70], [60, 55], [0, 30]], { aggregate: "avg" });
range(3, "심화과목 이수 과목 수", [[4, 100], [3, 85], [2, 70], [1, 50], [0, 0]]);
choice(3, "전공 구분", [["복수전공", 100], ["융합전공", 100], ["연계전공", 90], ["심화전공", 90], ["부전공", 80], ["주전공", 40]]);
choice(4, "이수 상태", [["이수완료", 100], ["이수중", 70], ["미이수", 0], ["포기", 0]]);
range(5, "출석률(%)", PERCENT);
range(5, "과제 기한 준수율(%)", PERCENT);
range(5, "주당 평균 로그인 횟수", [[7, 100], [5, 85], [3, 70], [1, 50], [0, 0]]);
range(5, "퀴즈 풀이 횟수(누적)", [[40, 100], [25, 85], [15, 70], [5, 50], [0, 0]]);
range(5, "학습계획 달성률(%)", [[90, 100], [75, 85], [60, 70], [40, 50], [0, 20]]);
range(6, "교수 면담 횟수(누적)", PER_SEMESTER_VISITS, { perSemester: true });
range(6, "학업상담 횟수(누적)", PER_SEMESTER_VISITS, { perSemester: true });
range(7, "토론방 게시글 수", [[10, 100], [5, 80], [2, 60], [1, 40], [0, 0]]);
range(7, "토론방 댓글 수", [[20, 100], [10, 80], [5, 60], [1, 40], [0, 0]]);
range(7, "질의응답 참여 횟수", [[10, 100], [5, 80], [2, 60], [1, 40], [0, 0]]);
range(8, "활동 유형", [[3, 100], [2, 85], [1, 70], [0, 0]], { aggregate: "count" });
range(8, "기간(개월)", MONTHS, { aggregate: "sum" });
choice(9, "게재 수준", [["국제학술지", 100], ["국내학술지", 90], ["국제학술대회", 85], ["국내학술대회", 75], ["교내", 60]], { aggregate: "maxPlus", bonusPerExtra: 5 });
range(10, "과목명", [[2, 100], [1, 80], [0, 0]], { aggregate: "count" });
range(11, "기간(개월)", [[6, 100], [4, 85], [2, 70], [1, 50], [0, 0]], { aggregate: "sum" });
choice(11, "전공 관련성", [["관련", 100], ["일부 관련", 70], ["무관", 40]]);
range(12, "기간(개월)", MONTHS, { aggregate: "sum" });
range(13, "진로·취업 상담 횟수(누적)", PER_SEMESTER_VISITS, { perSemester: true });
choice(13, "진로 목표 설정 여부", [["Y", 100], ["N", 0]]);
choice(14, "결과", [["대상", 100], ["최우수", 90], ["우수", 80], ["장려", 70], ["입선", 60], ["참가", 50]], {
  aggregate: "maxPlus", bonusPerExtra: 5, multiplier: { ...LEVEL_FACTORS, fieldId: fieldIdOf(14, "주관 수준") },
});
range(14, "대회명", COUNT3, { aggregate: "count" });
choice(15, "유형", [["사업자등록", 100], ["창업경진대회", 80], ["창업동아리", 70], ["창업교과목", 60]], { aggregate: "maxPlus", bonusPerExtra: 10 });
choice(16, "진행 상태", [["등록", 100], ["출원", 80]], { aggregate: "maxPlus", bonusPerExtra: 10 });
choice(17, "유형", [["교환학생", 100], ["국제연구", 90], ["어학연수", 80], ["해외봉사", 80], ["해외학습", 70], ["국제문화체험", 60]], { aggregate: "maxPlus", bonusPerExtra: 10 });
range(17, "기간(주)", [[16, 100], [8, 80], [4, 60], [1, 40], [0, 0]], { aggregate: "sum" });
range(18, "국제어 강의 이수 과목 수", [[4, 100], [3, 85], [2, 70], [1, 50], [0, 0]]);
range(18, "국제어 강의 이수 학점", [[12, 100], [9, 85], [6, 70], [3, 50], [0, 0]]);
range(19, "이수 시간(h)", [[60, 100], [30, 80], [15, 60], [1, 40], [0, 0]], { aggregate: "sum" });
range(19, "교육명", COUNT3, { aggregate: "count" });
choice(20, "주관 수준", [["국제", 100], ["전국", 90], ["지역", 80], ["교내", 70]], { aggregate: "maxPlus", bonusPerExtra: 10 });
range(20, "명칭", COUNT3, { aggregate: "count" });
choice(21, "활용 수준", [["능숙", 100], ["활용", 75], ["기초", 50]]);
choice(22, "직책", [["회장", 100], ["부회장", 90], ["부장", 80], ["총무", 75], ["부원", 60]], { aggregate: "maxPlus", bonusPerExtra: 5 });
range(22, "기간(개월)", [[24, 100], [12, 80], [6, 60], [1, 40], [0, 0]], { aggregate: "sum" });
range(23, "총 봉사시간(h)", [[10, 100], [6, 80], [3, 60], [0.01, 40], [0, 0]], { perSemester: true });
choice(23, "구분", [["유학생 봉사", 100], ["국외", 100], ["교외(국내)", 70], ["교내", 60]]);
choice(24, "유형", [["튜터", 100], ["멘토", 100], ["학습공동체", 80], ["스터디", 75], ["튜티", 60], ["멘티", 60]], { aggregate: "maxPlus", bonusPerExtra: 5 });
range(24, "기간(개월)", MONTHS, { aggregate: "sum" });
range(25, "동료평가 점수", [[4.5, 100], [4, 85], [3.5, 70], [3, 55], [0, 30]], { aggregate: "avg" });
presets.set(fieldIdOf(26, "시험명"), { ...base, fieldId: fieldIdOf(26, "시험명"), method: "language" });
range(27, "자격증명", [[3, 100], [2, 85], [1, 70], [0, 0]], { aggregate: "count" });
choice(28, "단계", [["최종 합격", 100], ["2차 합격", 85], ["1차 합격", 70], ["응시", 50]]);
range(30, "누적 이수시간(h)", [[15, 100], [10, 80], [5, 60], [0.01, 40], [0, 0]], { perSemester: true });

export function presetFor(fieldId: string): Preset | undefined {
  const preset = presets.get(fieldId);
  return preset ? structuredClone(preset) : undefined;
}
export const presetFieldIds = [...presets.keys()];

export const DEFAULT_LEVELS = [
  { level: 1, criterion: "관련 활동이 언급만 되어 있고 본인의 행동이 서술되지 않음" },
  { level: 2, criterion: "본인의 행동이 1건 서술되어 있으나 상황이나 결과와 연결되지 않음" },
  { level: 3, criterion: "상황, 본인의 행동, 결과가 모두 1건 이상 서술됨" },
  { level: 4, criterion: "본인의 행동이 2건 이상 구체적으로 서술되고 결과가 사실로 제시됨" },
  { level: 5, criterion: "본인의 행동이 2건 이상 구체적으로 서술되고 결과가 수치로 제시됨" },
];
export const DEFAULT_UNDECIDABLE = "서술이 비어 있거나 이 역량과 관련된 행동이 한 건도 없음";
