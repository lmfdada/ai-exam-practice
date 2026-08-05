import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { autoDetectMapping } from "@/lib/orders";
import { executeRule, type ParseContext, type ParseRule } from "@/lib/rules";

const SKIP_SHEET_KEYWORDS = ["说明", "目录", "封面", "template", "readme"];
const HEADER_KEYWORDS = [
  "编码", "名称", "数量", "门店", "地址", "电话", "手机", "姓名",
  "SKU", "规格", "备注", "单号", "订单", "配送", "收货", "序号",
  "编号", "货号", "品名", "物料", "仓库",
];

export type ParsedImport = {
  headers: string[];
  rows: Record<string, string>[];
  rowNumbers: number[];
  format: string;
};

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.text === "string") return objectValue.text;
    if (typeof objectValue.hyperlink === "string") return objectValue.hyperlink;
    if (Array.isArray(objectValue.richText)) {
      return objectValue.richText
        .map((item) => String((item as Record<string, unknown>).text ?? ""))
        .join("");
    }
    if (objectValue.result !== undefined) return String(objectValue.result);
    return "";
  }
  return String(value);
}

function detectHeaderRow(rows: string[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  rows.forEach((row, index) => {
    const score = row.reduce((total, cell) => {
      const value = cell.trim();
      const keywordScore = HEADER_KEYWORDS.some((keyword) => value.includes(keyword)) ? 1 : 0;
      return total + keywordScore + (value.length > 0 && value.length <= 15 ? 0.5 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function shouldKeepRow(row: string[], headers: string[]): boolean {
  if (!row.some((cell) => cell.trim())) return false;
  if (row.some((cell) => /^[▶■◆●▲▼]/.test(cell.trim()))) return false;
  if (row.some((cell) => /(小计|合计|总计|subtotal|total)/i.test(cell.trim()))) return false;
  const first = row[0]?.trim() ?? "";
  if (/^(调入门店|收货人|收货地址|收货电话|收货信息|发货信息|单据编号)/i.test(first)) return false;
  const matches = row.reduce((count, cell, index) => {
    const value = cell.trim();
    const header = headers[index]?.trim() ?? "";
    return count + (value && header && (value === header || header.includes(value)) ? 1 : 0);
  }, 0);
  return matches < Math.min(headers.length, 2);
}

function normalizeAutoMappedRows(headers: string[], rows: string[][]): Record<string, string>[] {
  const mapping = autoDetectMapping(headers);
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      mapped[mapping[header] || header] = row[index] ?? "";
    });
    return mapped;
  });
}

async function parseExcel(buffer: ArrayBuffer, rule?: ParseRule): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.filter(
    (sheet) => !SKIP_SHEET_KEYWORDS.some((keyword) => sheet.name.includes(keyword)),
  );
  if (!sheets.length) throw new Error("Excel 文件中没有包含数据的工作表");

  let targetSheets = sheets;
  if (rule?.config.sheets === "all") targetSheets = sheets;
  else if (Array.isArray(rule?.config.sheets)) {
    targetSheets = rule.config.sheets.map((index) => sheets[index]).filter(Boolean);
  } else {
    targetSheets = [sheets.reduce((a, b) => (a.rowCount >= b.rowCount ? a : b))];
  }

  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  let headers: string[] = [];
  for (const sheet of targetSheets) {
    const rawRows: string[][] = [];
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rawRows.push(values.map(cellValue));
    });
    if (!rawRows.length) continue;

    const headerIndex = rule?.config.headerDetection && typeof rule.config.headerDetection === "object"
      ? rule.config.headerDetection.row
      : detectHeaderRow(rawRows);
    const sheetHeaders = rawRows[headerIndex]?.map((cell) => cell.trim()) ?? [];
    const start = rule?.config.skipRowsBeforeHeader ?? headerIndex + 1;
    const dataRows = rawRows.slice(start).filter((row) => shouldKeepRow(row, sheetHeaders));
    const context: ParseContext = {
      rawRows: dataRows,
      rawHeaders: sheetHeaders,
      sourceName: sheet.name,
      fullRows: rawRows,
    };
    const parsedRows = rule ? executeRule(rule, context).rows : normalizeAutoMappedRows(sheetHeaders, dataRows);
    if (!headers.length && parsedRows.length) headers = Object.keys(parsedRows[0]);
    parsedRows.forEach((row, index) => {
      rows.push(row);
      rowNumbers.push(index + start + 1);
    });
  }
  return { headers, rows, rowNumbers, format: ".xlsx" };
}

async function parseDocx(buffer: ArrayBuffer, rule?: ParseRule): Promise<ParsedImport> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const lines = result.value.split("\n").map((line) => line.trim()).filter(Boolean);
  const rawRows = lines
    .map((line) => line.split(/\t|\s{2,}/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 1);
  if (!rawRows.length) throw new Error("未能从 Word 文件中提取到有效的表格数据");
  const headerIndex = detectHeaderRow(rawRows);
  const headers = rawRows[headerIndex] ?? [];
  const dataRows = rawRows.slice(headerIndex + 1);
  const context: ParseContext = { rawRows: dataRows, rawHeaders: headers, sourceName: "docx", fullRows: rawRows };
  const rows = rule ? executeRule(rule, context).rows : normalizeAutoMappedRows(headers, dataRows);
  return { headers: rows[0] ? Object.keys(rows[0]) : headers, rows, rowNumbers: rows.map((_, index) => index + headerIndex + 2), format: ".docx" };
}

export async function parseImportFile(
  buffer: ArrayBuffer,
  fileName: string,
  ruleJson?: string | null,
): Promise<ParsedImport> {
  let rule: ParseRule | undefined;
  if (ruleJson) {
    try {
      rule = JSON.parse(ruleJson) as ParseRule;
    } catch {
      throw new Error("解析规则不是有效 JSON");
    }
  }
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (extension === ".xlsx" || extension === ".xls") return parseExcel(buffer, rule);
  if (extension === ".docx") return parseDocx(buffer, rule);
  throw new Error(`异步导入暂不支持 ${extension || "未知"} 文件格式，请先使用 xlsx 或 docx`);
}
