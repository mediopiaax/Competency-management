import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AI_CONFIG } from "./config";

/** 구조화 출력 한 번 호출. 테스트에서는 가짜 구현으로 바꿔 넣는다. */
export type StructuredCall = <T>(args: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}) => Promise<T>;

let client: Anthropic | null = null;

export const callClaude: StructuredCall = async ({ system, user, schema, effort, maxTokens }) => {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: AI_CONFIG.model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("AI가 요청을 처리하지 않았습니다");
  if (response.stop_reason === "max_tokens" || response.parsed_output === null) throw new Error("AI 응답이 형식에 맞지 않습니다");
  return response.parsed_output;
};

const promptCache = new Map<string, string>();
export async function loadPrompt(file: string): Promise<string> {
  if (!promptCache.has(file)) promptCache.set(file, await readFile(path.join(process.cwd(), "prompts", file), "utf8"));
  return promptCache.get(file)!;
}
