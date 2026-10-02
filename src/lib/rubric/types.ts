import { z } from "zod";

export const bandSchema = z.object({ min: z.number(), score: z.number().min(0).max(100) });
export const optionSchema = z.object({ value: z.string().min(1), score: z.number().min(0).max(100) });
export const levelSchema = z.object({ level: z.number().int().min(1).max(5), criterion: z.string() });

export const METHODS = ["range", "choice", "language", "narrative"] as const;
export const AGGREGATES = ["max", "avg", "sum", "count", "maxPlus"] as const;

export const sourceSchema = z.object({
  id: z.string().min(1),
  fieldId: z.string().min(1),
  method: z.enum(METHODS),
  aggregate: z.enum(AGGREGATES).default("max"),
  bonusPerExtra: z.number().min(0).max(100).default(0),
  perSemester: z.boolean().default(false),
  bands: z.array(bandSchema).default([]),
  options: z.array(optionSchema).default([]),
  filter: z.object({ fieldId: z.string(), values: z.array(z.string()) }).nullable().default(null),
  multiplier: z
    .object({ fieldId: z.string(), factors: z.array(z.object({ value: z.string(), factor: z.number().min(0).max(1) })) })
    .nullable()
    .default(null),
  levels: z.array(levelSchema).default([]),
  undecidable: z.string().default(""),
});

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  weight: z.number().min(0).max(100),
  kind: z.enum(["basic", "bonus"]).default("basic"),
  combine: z.enum(["max", "avg"]).default("max"),
  sources: z.array(sourceSchema),
});

export const competencySchema = z.object({
  id: z.string().min(1),
  group: z.string().default(""),
  name: z.string().min(1),
  description: z.string().default(""),
  measurability: z.enum(["상", "중", "하"]).default("중"),
  note: z.string().default(""),
  items: z.array(itemSchema),
});

export const languageEntrySchema = z.object({
  exam: z.string().min(1),
  basis: z.enum(["score", "grade"]),
  bands: z.array(bandSchema).default([]),
  options: z.array(optionSchema).default([]),
});

export const settingsSchema = z.object({
  grades: z.array(z.object({ grade: z.string().min(1), min: z.number() })),
  holdThreshold: z.number().min(0).max(100),
  qualWeightCap: z.number().min(0).max(100),
  qualSwing: z.number().min(0).max(100),
  excludeExpired: z.boolean(),
});

export const rubricSchema = z.object({
  name: z.string().min(1),
  generatedBy: z.enum(["ai", "rules", "manual"]).default("manual"),
  settings: settingsSchema,
  languageTable: z.array(languageEntrySchema),
  competencies: z.array(competencySchema),
});

export type Band = z.infer<typeof bandSchema>;
export type ScoreOption = z.infer<typeof optionSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Competency = z.infer<typeof competencySchema>;
export type LanguageEntry = z.infer<typeof languageEntrySchema>;
export type RubricSettings = z.infer<typeof settingsSchema>;
export type Rubric = z.infer<typeof rubricSchema>;

export const DEFAULT_SETTINGS: RubricSettings = {
  grades: [
    { grade: "S", min: 90 },
    { grade: "A", min: 80 },
    { grade: "B", min: 70 },
    { grade: "C", min: 60 },
    { grade: "D", min: 0 },
  ],
  holdThreshold: 50,
  qualWeightCap: 30,
  qualSwing: 15,
  excludeExpired: true,
};

export const METHOD_LABEL: Record<Source["method"], string> = {
  range: "숫자 구간",
  choice: "선택지 점수",
  language: "어학 환산표",
  narrative: "서술 판정",
};

export const AGGREGATE_LABEL: Record<Source["aggregate"], string> = {
  max: "최고값",
  avg: "평균",
  sum: "합산 후 구간",
  count: "건수로 구간",
  maxPlus: "최고값 + 추가 건당 가산",
};
