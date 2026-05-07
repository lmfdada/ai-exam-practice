import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { autoDetectMapping, computeFingerprint, FIELD_KEYWORDS } from "@/lib/orders";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_HEADER_SCAN_ROWS = 8;

const DESCRIPTION_MARKERS = ["说明", "注意", "备注：", "提示"];

function isDescriptionRow(row: ExcelJS.Row): boolean {
  let nonEmptyCount = 0;
  let markerCount = 0;
  row.eachCell({ includeEmpty: false }, (cell) => {
    const val = String(cell.value || "").trim().toLowerCase();
    if (val) {
      nonEmptyCount++;
      if (DESCRIPTION_MARKERS.some((m) => val.includes(m))) {
        markerCount++;
      }
    }
  });
  if (nonEmptyCount === 0) return false;
  return markerCount / nonEmptyCount > 0.3;
}

function getRowCells(row: ExcelJS.Row, maxCols: number): string[] {
  const values: string[] = [];
  for (let col = 1; col <= maxCols; col++) {
    const cell = row.getCell(col);
    const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "";
    values.push(val);
  }
  return values;
}

function isRowEmpty(cells: string[]): boolean {
  return cells.every((v) => !v);
}

function calcHeaderScore(cells: string[]): number {
  const nonEmpty = cells.filter((v) => v.length > 0);
  if (nonEmpty.length < 3) return -1;

  const uniqueValues = new Set(nonEmpty);
  const uniquenessRatio = uniqueValues.size / nonEmpty.length;
  if (uniquenessRatio < 0.5) return -1;

  let keywordHits = 0;
  const allKeywords = Object.values(FIELD_KEYWORDS).flat();
  for (const cell of nonEmpty) {
    const cellLower = cell.toLowerCase();
    for (const kw of allKeywords) {
      if (cellLower.includes(kw.toLowerCase())) {
        keywordHits++;
        break;
      }
    }
  }

  const keywordScore = keywordHits / nonEmpty.length;
  return uniquenessRatio * 0.4 + keywordScore * 0.6;
}

function detectHeaderRow(worksheet: ExcelJS.Worksheet): { rowNumber: number; headers: string[] } {
  const maxCols = worksheet.columnCount;
  let bestRow = 1;
  let bestHeaders: string[] = [];
  let bestScore = -1;

  const maxScan = Math.min(MAX_HEADER_SCAN_ROWS, worksheet.rowCount);

  for (let rowNum = 1; rowNum <= maxScan; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const cells = getRowCells(row, maxCols);

    if (isRowEmpty(cells)) continue;
    if (isDescriptionRow(row)) continue;

    const score = calcHeaderScore(cells);
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowNum;
      bestHeaders = cells.filter((v) => v.length > 0);
    }
  }

  return { rowNumber: bestRow, headers: bestHeaders };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "请上传文件" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, message: `文件过大，最大支持 10MB` },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, message: "仅支持 .xlsx / .xls 文件" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    if (workbook.worksheets.length === 0) {
      return NextResponse.json(
        { success: false, message: "Excel 文件中没有工作表" },
        { status: 400 }
      );
    }

    const INSTRUCTION_SHEET_NAMES = ["说明", "使用说明", "填写说明", "help", "readme", "instructions"];

    interface SheetCandidate {
      worksheet: ExcelJS.Worksheet;
      headerRow: number;
      headers: string[];
      score: number;
    }
    const candidates: SheetCandidate[] = [];

    for (const ws of workbook.worksheets) {
      const nameLower = ws.name.toLowerCase();
      const isInstructionSheet = INSTRUCTION_SHEET_NAMES.some((n) => nameLower.includes(n));
      if (isInstructionSheet) continue;
      if (ws.rowCount < 2) continue;

      const result = detectHeaderRow(ws);
      if (result.headers.length > 0) {
        candidates.push({
          worksheet: ws,
          headerRow: result.rowNumber,
          headers: result.headers,
          score: calcHeaderScore(result.headers),
        });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { success: false, message: "无法识别数据工作表，请检查文件格式" },
        { status: 400 }
      );
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const worksheet = best.worksheet;
    const headerRowNum = best.headerRow;
    const headers = best.headers;

    const rawRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      const values: string[] = [];
      for (let i = 0; i < headers.length; i++) {
        const cell = row.getCell(i + 1);
        values.push(cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "");
      }
      if (values.some((v) => v)) {
        rawRows.push(values);
      }
    });

    const autoMapping = autoDetectMapping(headers);
    const fingerprint = computeFingerprint(headers);

    return NextResponse.json({
      success: true,
      data: {
        headers,
        rows: rawRows,
        autoMapping,
        fingerprint,
        sheetName: worksheet.name,
        totalRows: rawRows.length,
      },
    });
  } catch (error) {
    console.error("导入解析失败:", error);
    return NextResponse.json(
      { success: false, message: "文件解析失败，请检查文件是否损坏", error: String(error) },
      { status: 500 }
    );
  }
}
