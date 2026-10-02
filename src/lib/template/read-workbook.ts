import ExcelJS from "exceljs";

export type Cell = string | number | null;
export interface SheetGrid {
  name: string;
  rows: Cell[][];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function normalize(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "object") {
    if ("richText" in value) return normalize(value.richText.map((t) => t.text).join(""));
    if ("result" in value) return normalize(value.result as ExcelJS.CellValue);
    if ("formula" in value || "sharedFormula" in value) return null;
    if ("text" in value) return normalize(value.text as ExcelJS.CellValue);
  }
  return null;
}

export async function readWorkbook(data: ArrayBuffer | Buffer): Promise<SheetGrid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      while (rows.length < rowNumber) rows.push([]);
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        while (cells.length < colNumber - 1) cells.push(null);
        cells[colNumber - 1] = normalize(cell.value);
      });
      rows[rowNumber - 1] = cells;
    });
    return { name: ws.name, rows };
  });
}
