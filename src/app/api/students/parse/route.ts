import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseWorkbook, type ParseResult } from "@/lib/template/parse";
import { readWorkbook } from "@/lib/template/read-workbook";

const SAMPLE_FILE = "학생역량_데이터수집_템플릿_v1 (1).xlsx";
const MAX_BYTES = 20 * 1024 * 1024;

export interface ParsedFile extends ParseResult {
  fileName: string;
  error?: string;
}

async function parseBuffer(fileName: string, data: ArrayBuffer | Buffer): Promise<ParsedFile> {
  try {
    return { fileName, ...parseWorkbook(await readWorkbook(data)) };
  } catch {
    return { fileName, students: [], skippedSheets: [], rosterFound: false, error: "엑셀 파일(.xlsx)을 읽지 못했습니다" };
  }
}

export async function GET() {
  const data = await readFile(path.join(process.cwd(), "docs", "reference", SAMPLE_FILE));
  return Response.json({ files: [await parseBuffer(SAMPLE_FILE, data)] });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

  const files: ParsedFile[] = [];
  for (const file of uploads) {
    if (file.size > MAX_BYTES) {
      files.push({ fileName: file.name, students: [], skippedSheets: [], rosterFound: false, error: "파일이 20MB를 넘습니다" });
      continue;
    }
    files.push(await parseBuffer(file.name, await file.arrayBuffer()));
  }
  return Response.json({ files });
}
