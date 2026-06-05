import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { autoDetectMapping, computeFingerprint } from "@/lib/orders";
import { executeRule } from "@/lib/rules";
import type { ParseRule, ParseContext } from "@/lib/rules";

// ===== 配置 =====
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTS = [".xlsx", ".xls", ".docx", ".pdf"];
const SKIP_SHEET_KEYWORDS = ["说明", "目录", "封面", "template", "readme"];

// ===== 表头检测 =====
const KNOWN_HEADER_KEYWORDS = [
  "编码", "名称", "数量", "门店", "地址", "电话", "手机", "姓名",
  "SKU", "规格", "备注", "单号", "订单", "配送", "收货",
  "序号", "编号", "货号", "品名", "物料", "仓库",
];

function scoreRow(row: string[]): number {
  let score = 0;
  for (const cell of row) {
    const s = String(cell || "").trim();
    if (s.length > 10) continue;
    for (const kw of KNOWN_HEADER_KEYWORDS) {
      if (s.includes(kw)) { score++; break; }
    }
    if (s.length > 0 && s.length <= 15) score += 0.5;
  }
  return score;
}

function detectHeaderRow(rows: string[][]): number {
  let bestRow = 0;
  let bestScore = -1;
  for (let i = 0; i < rows.length; i++) {
    const score = scoreRow(rows[i]);
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestRow;
}

/** 尝试将文本按分隔符解析为行列结构 */
function parseTextToRows(text: string): string[][] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 尝试检测分隔符：tab 优先，其次多空格
  const tabCount = lines.reduce((sum, l) => sum + (l.includes("\t") ? 1 : 0), 0);
  const delimiter: string | RegExp = tabCount >= lines.length * 0.3 ? "\t" : /\s{2,}/;

  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line.split(delimiter).map((c) => c.trim()).filter(Boolean);
    if (cells.length > 1) {
      rows.push(cells);
    }
  }
  return rows;
}

// ===== 解析 Excel =====
interface ParsedSheet {
  sourceName: string;
  headers: string[];
  /** 数据行（表头之后） */
  rawRows: string[][];
  /** 全量原始行（含表头及上方信息行） */
  fullRows: string[][];
  rowCount: number;
}

const cellValue = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Rich text with text property
    if (typeof obj.text === "string") return obj.text;
    // Hyperlink
    if (typeof obj.hyperlink === "string") return obj.hyperlink;
    // Rich text array - extract combined text
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((rt: Record<string, unknown>) => String(rt.text ?? "")).join("");
    }
    // Structured reference or unknown internal object
    return "";
  }
  return String(v);
};

async function parseExcelSheets(
  buffer: ArrayBuffer,
  rule?: ParseRule
): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const allSheets = workbook.worksheets.filter(
    (ws) => !SKIP_SHEET_KEYWORDS.some((sk) => ws.name.includes(sk))
  );
  if (allSheets.length === 0) {
    throw new Error("Excel 文件中没有包含数据的工作表");
  }

  let targetSheets = allSheets;
  if (rule?.config?.sheets) {
    if (rule.config.sheets === "all") {
      targetSheets = allSheets;
    } else if (Array.isArray(rule.config.sheets)) {
      targetSheets = rule.config.sheets
        .map((i: number) => allSheets[i])
        .filter(Boolean) as ExcelJS.Worksheet[];
      if (targetSheets.length === 0) targetSheets = [allSheets[0]];
    } else {
      targetSheets = [allSheets[0]];
    }
  } else {
    targetSheets = [allSheets.reduce((a, b) => (a.rowCount >= b.rowCount ? a : b))];
  }

  const result: ParsedSheet[] = [];

  for (const ws of targetSheets) {
    const rows: string[][] = [];
    ws.eachRow((excelRow) => {
      const cells: string[] = [];
      excelRow.eachCell((c) => { cells.push(cellValue(c.value)); });
      rows.push(cells);
    });
    if (rows.length === 0) continue;

    const headerRow = rule?.config?.headerDetection === "auto" || !rule
      ? detectHeaderRow(rows)
      : typeof rule?.config?.headerDetection === "object" && "row" in rule.config.headerDetection
        ? rule.config.headerDetection.row
        : detectHeaderRow(rows);

    const rawHeaders = rows[headerRow]?.map((h) => String(h || "").trim()) || [];
    const skipBefore = rule?.config?.skipRowsBeforeHeader ?? 0;
    const dataRows = rows.slice(skipBefore || headerRow + 1)
      .filter((r) => r.some((c) => String(c || "").trim() !== ""));

    result.push({
      sourceName: ws.name,
      headers: rawHeaders,
      rawRows: dataRows,
      fullRows: rows,
      rowCount: dataRows.length,
    });
  }

  return result;
}

// ===== 解析 Word (.docx) =====
async function parseDocx(
  buffer: ArrayBuffer,
): Promise<{ headers: string[]; dataRows: string[][]; rowCount: number }> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const text = result.value;

  const rows = parseTextToRows(text);
  if (rows.length === 0) {
    throw new Error("未能从 Word 文件中提取到有效的表格数据");
  }

  const headerRow = detectHeaderRow(rows);
  const headers = rows[headerRow]?.map((h) => String(h || "").trim()) || [];
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c || "").trim() !== ""));

  return { headers, dataRows, rowCount: dataRows.length };
}

// ===== 解析 PDF (直接使用 pdfjs-dist，绕过 @napi-rs/canvas 依赖) =====
async function parsePdf(
  buffer: ArrayBuffer,
): Promise<{ headers: string[]; dataRows: string[][]; rowCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getData } = await import("pdf-parse/worker");
  pdfjs.GlobalWorkerOptions.workerSrc = getData();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  // 收集所有文本 items，按 hasEOL 分行
  const lines: { items: { str: string; x: number }[] }[] = [];
  let currentLineItems: { str: string; x: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    for (const item of textContent.items as Array<Record<string, unknown>>) {
      if (typeof item.str === "string" && item.transform) {
        const x = (item.transform as number[])[4];
        currentLineItems.push({ str: item.str, x });
        if (item.hasEOL) {
          lines.push({ items: [...currentLineItems].sort((a, b) => a.x - b.x) });
          currentLineItems = [];
        }
      }
    }
    if (currentLineItems.length > 0) {
      lines.push({ items: [...currentLineItems].sort((a, b) => a.x - b.x) });
    }
    page.cleanup();
  }
  await doc.destroy();

  // 将每行转为可读文本（用于表头检测和元数据过滤）
  const lineTexts = lines.map((l) => l.items.map((i) => i.str).join(" ").trim());

  // 元数据前缀列表（行内容以此开头则跳过）
  const metadataPrefixes = [
    "单据编号", "单据状态", "复审状态", "分拣状态", "制单日期",
    "创建人", "发货人", "收货人", "打印时间", "订货单位",
    "是否", "需要", "订单日期", "备注", "第", "收货机构", "供货机构",
    "送货机构", "业务模式", "配送重量", "发货操作时间", "期望",
    "预计发货", "期望到货", "发货日期",
    "收货地址", "打印次数", "物品类别", "黔寨寨",
  ];

  // 第一步：找到表头行（在有内容的行中按关键词评分）
  const scoredRows: { index: number; text: string; items: { str: string; x: number }[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lineTexts[i];
    if (!text || metadataPrefixes.some((p) => text.startsWith(p))) continue;
    const nonSpaceItems = lines[i].items.filter((it) => it.str.trim().length > 0);
    if (nonSpaceItems.length < 2) continue;
    const score = scoreRow(nonSpaceItems.map((it) => it.str));
    if (score > 0) {
      scoredRows.push({ index: i, text, items: nonSpaceItems });
    }
  }

  if (scoredRows.length === 0) {
    throw new Error("未能从 PDF 文件中识别到表格表头");
  }

  // 最高分的行作为表头行
  scoredRows.sort((a, b) => {
    const sa = scoreRow(a.items.map((i) => i.str));
    const sb = scoreRow(b.items.map((i) => i.str));
    return sb - sa;
  });
  const headerLine = scoredRows[0];
  const rawHeaders = headerLine.items.map((i) => i.str.trim());
  const headers = rawHeaders.filter((h) => h.length > 0);

  // 用表头列的 x 坐标定义列边界（使用中间点分割）
  const headerItems = headerLine.items;
  const colBoundaries: { name: string; minX: number; maxX: number }[] = [];
  for (let j = 0; j < headerItems.length; j++) {
    const name = headerItems[j].str.trim();
    if (!name) continue;
    // 列边界：使用相邻表头 x 的中间点作为分界线
    const minX = j === 0 ? 0 : (headerItems[j].x + headerItems[j - 1].x) / 2;
    const maxX =
      j < headerItems.length - 1
        ? (headerItems[j + 1].x + headerItems[j].x) / 2
        : headerItems[j].x + 200;
    colBoundaries.push({ name, minX, maxX });
  }

  // ===== 合并被 hasEOL 截断的连续行 =====
  // 判断下一行是否为上一行的续行：下一行的第一个非空 item 在很左边（x < 40）但内容是空字符串，
  // 或下一行没有"序号"位置（x < 40）的数字项
  function isContinuationLine(_prevItems: { str: string; x: number }[], nextItems: { str: string; x: number }[]): boolean {
    const nextNonEmpty = nextItems.filter((it) => it.str.trim().length > 0);
    if (nextNonEmpty.length === 0) return true;
    // 检查下一行在"序号"位置（x < 40）是否有数字
    const hasSeqNum = nextNonEmpty.some((it) => it.x < 40 && /^\d+$/.test(it.str.trim()));
    if (hasSeqNum) return false;
    // 如果下一行的 items 都集中在右半部分（x > 第2个表头的中间点），则是续行
    const rightThreshold = headerItems.length > 2 ? (headerItems[1].x + headerItems[0].x) / 2 : 80;
    return nextNonEmpty.every((it) => it.x > rightThreshold) && nextNonEmpty.length <= 3;
  }

  // 合并连续行
  const mergedLines: { items: { str: string; x: number }[]; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && isContinuationLine(lines[i - 1].items, lines[i].items)) {
      // 合并到上一行
      const prev = mergedLines[mergedLines.length - 1];
      const mergedItems = [...prev.items, ...lines[i].items].sort((a, b) => a.x - b.x);
      prev.items = mergedItems;
      prev.text = mergedItems.map((it) => it.str).join(" ").trim();
    } else {
      mergedLines.push({
        items: [...lines[i].items],
        text: lineTexts[i],
      });
    }
  }
  const mergedLineTexts = mergedLines.map((l) => l.text);
  // 更新 headerLine.index 到合并后的行索引
  let mergedHeaderIndex = -1;
  for (let i = 0; i < mergedLines.length; i++) {
    if (mergedLines[i].items === headerLine.items ||
        mergedLines[i].text === headerLine.text) {
      mergedHeaderIndex = i;
      break;
    }
  }

  // 为每一行分配列
  const tableRows: string[][] = [];
  for (let i = 0; i < mergedLines.length; i++) {
    const text = mergedLineTexts[i];
    if (i === mergedHeaderIndex) continue;
    if (!text || metadataPrefixes.some((p) => text.startsWith(p))) continue;
    if (/^\d+$/.test(text.trim())) continue;

    const nonSpaceItems = mergedLines[i].items.filter((it) => it.str.trim().length > 0);
    if (nonSpaceItems.length < 1) continue;

    // 为每个列位置收集文本
    const cellTexts: string[] = new Array(colBoundaries.length).fill("");
    for (const item of nonSpaceItems) {
      const colIdx = colBoundaries.findIndex(
        (b) => item.x >= b.minX && item.x < b.maxX,
      );
      if (colIdx >= 0) {
        cellTexts[colIdx] = (cellTexts[colIdx] + " " + item.str).trim();
      }
    }

    // 至少有一个非空列即保留（不再要求 >= 2）
    const filledCells = cellTexts.filter((c) => c.length > 0);
    if (filledCells.length >= 1) {
      // 过滤合计行（"合"/"计"单独出现，或只有数字+合计）
      const isSummary = filledCells.every((c) => /^[\d\s合计]*$/.test(c.trim()));
      if (isSummary && filledCells.some((c) => /^[合计]+$/.test(c.trim()))) {
        continue;
      }
      tableRows.push(cellTexts);
    }
  }

  if (tableRows.length === 0) {
    throw new Error("未能从 PDF 文件中提取到有效的表格数据");
  }

  const dataRows = tableRows.filter((r) =>
    r.some((c) => c.trim().length > 0),
  );

  return { headers, dataRows, rowCount: dataRows.length };
}

// ===== POST 处理 =====
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const ruleJson = formData.get("rule") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "请上传文件" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "文件大小超过 10MB 限制" }, { status: 400 });
    }

    // 空文件检测
    if (file.size === 0) {
      return NextResponse.json({
        success: false,
        message: "上传的文件为空（0 字节），请检查文件是否正确",
      }, { status: 400 });
    }

    const nameLower = file.name.toLowerCase();
    const ext = nameLower.slice(nameLower.lastIndexOf("."));
    if (!ALLOWED_EXTS.includes(ext)) {
      return NextResponse.json({ success: false, message: `不支持的文件格式 "${ext}"，仅支持 ${ALLOWED_EXTS.join(", ")}` }, { status: 400 });
    }

    let rule: ParseRule | undefined;
    if (ruleJson) {
      try {
        const parsed = JSON.parse(ruleJson) as Partial<ParseRule>;
        // 前端发送的 Rule 对象缺少 config，补充默认值
        rule = {
          id: parsed.id || "",
          name: parsed.name || "",
          description: parsed.description || "",
          createdAt: parsed.createdAt || new Date().toISOString(),
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          fileTypes: parsed.fileTypes || ["xlsx"],
          config: parsed.config || {
            sheets: "auto" as const,
            headerDetection: "auto" as const,
            columns: [],
            steps: [],
          },
        };
      } catch {
        // 规则解析失败，忽略
      }
    }

    const buffer = await file.arrayBuffer();

    // ===== 通用编码异常检测 =====
    // 检查空 buffer 或极小 buffer（文件内容几乎不存在）
    if (!buffer || buffer.byteLength === 0) {
      return NextResponse.json({
        success: false,
        message: `文件「${file.name}」内容为空（无法读取任何字节），文件可能已损坏或格式不正确`,
      }, { status: 400 });
    }

    // 对于文本类文件，检查是否包含常见编码 BOM 标识
    const headerBytes = new Uint8Array(buffer.slice(0, Math.min(4, buffer.byteLength)));
    const hasBOM = headerBytes[0] === 0xEF && headerBytes[1] === 0xBB && headerBytes[2] === 0xBF; // UTF-8 BOM
    if (hasBOM) {
      console.debug(`[import] 文件 ${file.name} 包含 UTF-8 BOM，已自动处理`);
    }

    // ===== 按格式解析 =====
    let allHeaders: string[] = [];
    let allDataRows: Record<string, string>[] = [];
    let rowCount = 0;

    if (ext === ".xlsx" || ext === ".xls") {
      const parsedSheets = await parseExcelSheets(buffer, rule);

      if (rule) {
        // 有规则：对每个 sheet 执行 executeRule（包含列映射 + 后处理器）
        for (const sheet of parsedSheets) {
          const context: ParseContext = {
            rawRows: sheet.rawRows,
            rawHeaders: sheet.headers,
            sourceName: sheet.sourceName,
            fullRows: sheet.fullRows,
          };
          const result = executeRule(rule, context);
          allDataRows.push(...result.rows);
        }
        if (allDataRows.length > 0) {
          allHeaders = Object.keys(allDataRows[0]);
        }
        rowCount = allDataRows.length;
      } else {
        // 无规则：使用所有 sheet 的数据行合并
        for (const sheet of parsedSheets) {
          allDataRows.push(
            ...sheet.rawRows.map((row) => {
              const mapped: Record<string, string> = {};
              sheet.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
              return mapped;
            })
          );
        }
        if (allDataRows.length > 0) {
          allHeaders = Object.keys(allDataRows[0]);
        }
        rowCount = allDataRows.length;
      }
    } else if (ext === ".docx") {
      const docxResult = await parseDocx(buffer);
      allHeaders = docxResult.headers;
      allDataRows = docxResult.dataRows.map((row) => {
        const mapped: Record<string, string> = {};
        docxResult.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
        return mapped;
      });
      rowCount = docxResult.rowCount;
    } else if (ext === ".pdf") {
      const pdfResult = await parsePdf(buffer);
      allHeaders = pdfResult.headers;
      allDataRows = pdfResult.dataRows.map((row) => {
        const mapped: Record<string, string> = {};
        pdfResult.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
        return mapped;
      });
      rowCount = pdfResult.rowCount;
    }

    if (allDataRows.length === 0) {
      const formatLabel = ext === ".xlsx" || ext === ".xls" ? "Excel"
        : ext === ".docx" ? "Word"
        : ext === ".pdf" ? "PDF"
        : "文件";
      return NextResponse.json({
        success: false,
        message: `未能从${formatLabel}文件「${file.name}」中提取到有效数据行。可能原因：\
1) 文件使用了非标准表格格式；2) 文件为空或只包含合并单元格/图片；3) 文件编码异常（请尝试重新导出为 .xlsx 格式）`,
      }, { status: 400 });
    }

    // ===== 将 rows 从对象数组转为二维数组（前端 ImportData 要求 string[][]） =====
    const rowsAsArrays: string[][] = allDataRows.map((row) =>
      allHeaders.map((h) => row[h] || "")
    );

    // ===== 自动列映射 =====
    let mapping: Record<string, string>;
    if (rule?.config?.columns && rule.config.columns.length > 0) {
      // 有规则时 headers 已经是映射后的字段名，直接使用恒等映射
      mapping = Object.fromEntries(allHeaders.map((h) => [h, h]));
    } else {
      mapping = autoDetectMapping(allHeaders);
    }

    const fingerprint = computeFingerprint(allHeaders);

    return NextResponse.json({
      success: true,
      data: {
        headers: allHeaders,
        rows: rowsAsArrays.slice(0, 200),
        rowCount,
        mapping,
        fingerprint,
        format: ext,
      },
    });
  } catch (error) {
    console.error("导入解析失败:", error);

    let message = error instanceof Error ? error.message : "解析失败";

    // 编码/格式异常检测
    const errorStr = String(error);
    if (errorStr.includes("encoding") || errorStr.includes("Encoding") ||
        errorStr.includes("charset") || errorStr.includes("iconv") ||
        errorStr.includes("decode")) {
      message = `文件编码异常，请尝试重新导出为 .xlsx 格式后再上传（原始错误: ${message}）`;
    } else if (
      errorStr.includes("corrupt") || errorStr.includes("corrupted") ||
      errorStr.includes("invalid") || errorStr.includes("bad") ||
      errorStr.includes("损坏") || errorStr.includes("格式错误") ||
      errorStr.includes("not a") || errorStr.includes("unexpected")
    ) {
      message = `文件可能已损坏或格式不正确，请检查文件后重新导出（原始错误: ${message}）`;
    } else if (
      errorStr.includes("password") || errorStr.includes("protected") ||
      errorStr.includes("加密") || errorStr.includes("密码")
    ) {
      message = `文件已被加密/保护，请先解密后再上传（原始错误: ${message}）`;
    }

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
