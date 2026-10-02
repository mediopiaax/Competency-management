/** AI 호출 설정. 판정 재현성은 온도가 아니라 판정 캐시로 보장한다(현재 모델은 온도 설정을 받지 않는다). */
export const AI_CONFIG = {
  model: process.env.AI_MODEL ?? "claude-opus-5-5",
  draft: { effort: "medium" as const, maxTokens: 16000, promptFile: "rubric-draft.v1.md", concurrency: 4, retries: 2 },
  judge: { effort: "medium" as const, maxTokens: 8000, promptFile: "narrative-judge.v1.md", retries: 1 },
};

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
