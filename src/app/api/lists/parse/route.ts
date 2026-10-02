import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildCompetencies, guessSheet, parseCsv, type ColumnMapping } from "@/lib/competency/parse-list";
import { readWorkbook, type SheetGrid } from "@/lib/template/read-workbook";
import { fail } from "@/lib/session";

const SAMPLE = "역량목록_설명추가 (1).xlsx";

export async function POST(request: Request) {
  const form = await request.formData();
  let sheets: SheetGrid[];
  let fileName: string;
  try {
    if (form.get("sample") === "1") {
      fileName = SAMPLE;
      sheets = await readWorkbook(await readFile(path.join(process.cwd(), "docs", "reference", SAMPLE)));
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) return fail("파일이 없습니다");
      fileName = file.name;
      sheets = /\.csv$/i.test(file.name) ? [{ name: file.name, rows: parseCsv(await file.text()) }] : await readWorkbook(await file.arrayBuffer());
    }
  } catch {
    return fail("엑셀(.xlsx) 또는 CSV 파일을 읽지 못했습니다");
  }
  const guesses = sheets.map(guessSheet);
  const sheetName = (form.get("sheet") as string | null) ?? guesses[0]?.name;
  const guess = guesses.find((g) => g.name === sheetName);
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!guess || !sheet) return fail("시트를 찾지 못했습니다");

  const mapping: ColumnMapping = form.get("mapping") ? JSON.parse(form.get("mapping") as string) : guess.mapping;
  let competencies: ReturnType<typeof buildCompetencies> = [];
  let mappingError: string | null = null;
  try {
    competencies = buildCompetencies(sheet, guess.headerRow, mapping);
  } catch (e) {
    mappingError = e instanceof Error ? e.message : "열을 지정하세요";
  }
  return Response.json({ fileName, sheets: guesses.map((g) => g.name), sheet: sheetName, headers: guess.headers, preview: guess.preview, mapping, competencies, mappingError });
}
