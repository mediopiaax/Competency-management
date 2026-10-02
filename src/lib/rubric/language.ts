import type { LanguageEntry } from "./types";

const scoreBands = (...pairs: [number, number][]) => pairs.map(([min, score]) => ({ min, score }));
const gradeOptions = (...pairs: [string, number][]) => pairs.map(([value, score]) => ({ value, score }));

/** 근거 없는 가정: 기관이 반드시 검토·수정해야 하는 기본 환산표 */
export const DEFAULT_LANGUAGE_TABLE: LanguageEntry[] = [
  { exam: "TOEIC", basis: "score", bands: scoreBands([900, 100], [800, 85], [700, 70], [600, 55], [0, 30]), options: [] },
  { exam: "TOEFL iBT", basis: "score", bands: scoreBands([105, 100], [90, 85], [75, 70], [60, 55], [0, 30]), options: [] },
  { exam: "TOEIC Speaking", basis: "score", bands: scoreBands([180, 100], [160, 85], [130, 70], [110, 55], [0, 30]), options: [] },
  { exam: "OPIc", basis: "grade", bands: [], options: gradeOptions(["AL", 100], ["IH", 90], ["IM3", 80], ["IM2", 70], ["IM1", 60], ["IL", 45], ["NH", 30]) },
  { exam: "HSK", basis: "grade", bands: [], options: gradeOptions(["6급", 100], ["5급", 85], ["4급", 70], ["3급", 55], ["2급", 40], ["1급", 30]) },
  { exam: "JPT", basis: "score", bands: scoreBands([850, 100], [700, 85], [550, 70], [400, 55], [0, 30]), options: [] },
  { exam: "JLPT", basis: "grade", bands: [], options: gradeOptions(["N1", 100], ["N2", 85], ["N3", 70], ["N4", 50], ["N5", 35]) },
  { exam: "DELF/DALF", basis: "grade", bands: [], options: gradeOptions(["C2", 100], ["C1", 100], ["B2", 85], ["B1", 70], ["A2", 50], ["A1", 35]) },
  { exam: "DELE", basis: "grade", bands: [], options: gradeOptions(["C2", 100], ["C1", 100], ["B2", 85], ["B1", 70], ["A2", 50], ["A1", 35]) },
];
