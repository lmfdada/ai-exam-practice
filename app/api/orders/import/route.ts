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

// ===== 表头检测（仅用于无规则 fallback） =====
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

// ===== 解析 Excel - 简化版（只读取原始数据，不做格式判断） =====
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
      // ExcelJS row.values[0] is empty, skip it
      const rowValues = excelRow.values;
      const values = Array.isArray(rowValues) ? rowValues : [];
      const cells = values.slice(1).map(c => cellValue(c));
      rows.push(cells);
    });
    if (rows.length === 0) continue;

    // 简单处理：只自动检测表头行，不做任何格式判断
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
): Promise<{ headers: string[]; dataRows: string[][]; rowCount: number; fullRows: string[][] }> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const text = result.value;

  const rows = parseTextToRows(text);
  if (rows.length === 0) {
    throw new Error("未能从 Word 文件中提取到有效的表格数据");
  }

  const headerRow = detectHeaderRow(rows);
  const headers = rows[headerRow]?.map((h) => String(h || "").trim()) || [];
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c || "").trim() !== ""));

  return { headers, dataRows, rowCount: dataRows.length, fullRows: rows };
}

// ===== 解析 PDF - 简化版 =====
async function parsePdf(
  buffer: ArrayBuffer,
): Promise<{ headers: string[]; dataRows: string[][]; rowCount: number; fullRows: string[][] }> {
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

  // 简化处理：将每行直接转为字符串数组（非结构化表格）
  const fullRows = lines.map(l => l.items.map(i => i.str));
  
  if (fullRows.length === 0) {
    throw new Error("未能从 PDF 文件中提取到有效的数据");
  }

  // 检测表头行
  const headerRowIdx = detectHeaderRow(fullRows);
  const headers = fullRows[headerRowIdx]?.map(h => String(h || "").trim()) || [];
  const dataRows = fullRows.slice(headerRowIdx + 1).filter(r => r.some(c => String(c || "").trim() !== ""));

  return { headers, dataRows, rowCount: dataRows.length, fullRows };
}

// ===== POST 处理 =====
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const ruleJson = formData.get("rule") as string | null;
    const isStream = request.nextUrl.searchParams.get("stream") === "true";

    if (!file) {
      const msg = JSON.stringify({ success: false, message: "请上传文件" });
      return isStream
        ? streamingResponse(new TextEncoder().encode(msg + "\n"))
        : NextResponse.json({ success: false, message: "请上传文件" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      const msg = JSON.stringify({ success: false, message: "文件大小超过 10MB 限制" });
      return isStream
        ? streamingResponse(new TextEncoder().encode(msg + "\n"))
        : NextResponse.json({ success: false, message: "文件大小超过 10MB 限制" }, { status: 400 });
    }

    if (file.size === 0) {
      const msg = JSON.stringify({ success: false, message: "上传的文件为空（0 字节）" });
      return isStream
        ? streamingResponse(new TextEncoder().encode(msg + "\n"))
        : NextResponse.json({ success: false, message: "上传的文件为空（0 字节）" }, { status: 400 });
    }

    const nameLower = file.name.toLowerCase();
    const ext = nameLower.slice(nameLower.lastIndexOf("."));
    if (!ALLOWED_EXTS.includes(ext)) {
      const msg = JSON.stringify({ success: false, message: `不支持的文件格式 "${ext}"，仅支持 ${ALLOWED_EXTS.join(", ")}` });
      return isStream
        ? streamingResponse(new TextEncoder().encode(msg + "\n"))
        : NextResponse.json({ success: false, message: `不支持的文件格式 "${ext}"，仅支持 ${ALLOWED_EXTS.join(", ")}` }, { status: 400 });
    }

    // 如果是流式模式，返回流式响应
    if (isStream) {
      return handleStreamImport(file, ruleJson, ext);
    }

    // 非流式模式：保持原有逻辑
    return handleNonStreamImport(file, ruleJson, ext);
  } catch (error) {
    console.error("导入解析失败:", error);

    let message = error instanceof Error ? error.message : "解析失败";
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
      message = `文件可能已损坏或格式不正确（原始错误: ${message}）`;
    } else if (
      errorStr.includes("password") || errorStr.includes("protected") ||
      errorStr.includes("加密") || errorStr.includes("密码")
    ) {
      message = `文件已被加密/保护，请先解密后再上传（原始错误: ${message}）`;
    }

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// ===== 流式响应工具 =====
function streamingResponse(chunk: Uint8Array): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function createStream(
  file: File,
  ruleJson: string | null,
  ext: string
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(enc.encode(JSON.stringify(data) + "\n"));
      };

      try {
        send({ type: "progress", current: 0, total: 100, phase: "正在读取文件..." });

        let rule: ParseRule | undefined;
        if (ruleJson) {
          try {
            const parsed = JSON.parse(ruleJson) as Partial<ParseRule>;
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
          } catch { /* ignore */ }
        }

        const buffer = await file.arrayBuffer();
        send({ type: "progress", current: 15, total: 100, phase: "文件格式验证通过，开始解析数据..." });

        let allHeaders: string[] = [];
        let allDataRows: Record<string, string>[] = [];
        let rowCount = 0;

        if (ext === ".xlsx" || ext === ".xls") {
          send({ type: "progress", current: 25, total: 100, phase: "打开 Excel 文件，检测工作表..." });
          const parsedSheets = await parseExcelSheets(buffer, rule);

          send({ type: "progress", current: 40, total: 100, phase: `读取到 ${parsedSheets.length} 个工作表，提取数据行...` });

          const fallbackDataRows: Record<string, string>[] = [];
          let fallbackHeaders: string[] = [];
          for (const sheet of parsedSheets) {
            fallbackDataRows.push(
              ...sheet.rawRows.map((row) => {
                const mapped: Record<string, string> = {};
                sheet.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
                return mapped;
              })
            );
            if (parsedSheets.length === 1) {
              // fullRows is not used later, skip
            }
          }
          if (fallbackDataRows.length > 0) {
            fallbackHeaders = Object.keys(fallbackDataRows[0]);
          }

          send({ type: "progress", current: 60, total: 100, phase: `数据提取完成（${fallbackDataRows.length} 行），执行列映射...` });

          if (rule) {
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

            const hasStandardFields = allHeaders.some((h) =>
              ["external_code", "receiver_store", "receiver_name", "receiver_phone",
               "receiver_address", "sku_code", "sku_name", "sku_qty", "sku_spec", "remark"].includes(h)
            );
            if (!hasStandardFields) {
              allDataRows = fallbackDataRows;
              allHeaders = fallbackHeaders;
              rowCount = allDataRows.length;
            }
          } else {
            allDataRows = fallbackDataRows;
            allHeaders = fallbackHeaders;
            rowCount = allDataRows.length;
          }
        } else if (ext === ".docx") {
          send({ type: "progress", current: 30, total: 100, phase: "读取 Word 文档..." });
          const docxResult = await parseDocx(buffer);
          allHeaders = docxResult.headers;
          allDataRows = docxResult.dataRows.map((row) => {
            const mapped: Record<string, string> = {};
            docxResult.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
            return mapped;
          });
          rowCount = docxResult.rowCount;

          send({ type: "progress", current: 60, total: 100, phase: `Word 数据提取完成（${rowCount} 行），执行映射...` });

          if (rule && rowCount > 0) {
            const context: ParseContext = {
              rawRows: docxResult.dataRows,
              rawHeaders: docxResult.headers,
              sourceName: file.name,
              fullRows: docxResult.fullRows,
            };
            const result = executeRule(rule, context);
            if (result.rows.length > 0) {
              allDataRows = result.rows;
              allHeaders = Object.keys(result.rows[0]);
              rowCount = result.rows.length;
            }
          }
        } else if (ext === ".pdf") {
          send({ type: "progress", current: 30, total: 100, phase: "读取 PDF 文档..." });
          const pdfResult = await parsePdf(buffer);
          allHeaders = pdfResult.headers;
          allDataRows = pdfResult.dataRows.map((row) => {
            const mapped: Record<string, string> = {};
            pdfResult.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
            return mapped;
          });
          rowCount = pdfResult.rowCount;

          send({ type: "progress", current: 60, total: 100, phase: `PDF 数据提取完成（${rowCount} 行）...` });

          if (rule && rowCount > 0) {
            const context: ParseContext = {
              rawRows: pdfResult.dataRows,
              rawHeaders: pdfResult.headers,
              sourceName: file.name,
              fullRows: pdfResult.fullRows,
            };
            const result = executeRule(rule, context);
            if (result.rows.length > 0) {
              allDataRows = result.rows;
              allHeaders = Object.keys(result.rows[0]);
              rowCount = result.rows.length;
            }
          }
        }

        // 过滤噪声行（卡片式布局中拖尾的合计/单据/收货信息等非明细行）
        if (rule) {
          allDataRows = allDataRows.filter((row) => row.sku_code || row.sku_name);
          rowCount = allDataRows.length;
        }

        if (allDataRows.length === 0) {
          const formatLabel = ext === ".xlsx" || ext === ".xls" ? "Excel"
            : ext === ".docx" ? "Word"
            : ext === ".pdf" ? "PDF"
            : "文件";
          send({ type: "result", success: false, message: `未能从${formatLabel}文件「${file.name}」中提取到有效数据行。请使用规则配置来解析此文件格式。` });
          controller.close();
          return;
        }

        send({ type: "progress", current: 80, total: 100, phase: `验证完成（${rowCount} 行），生成预览...` });

        const rowsAsArrays: string[][] = allDataRows.map((row) =>
          allHeaders.map((h) => row[h] || "")
        );

        let mapping: Record<string, string>;
        if (rule?.config?.columns && rule.config.columns.length > 0) {
          mapping = Object.fromEntries(allHeaders.map((h) => [h, h]));
        } else {
          mapping = autoDetectMapping(allHeaders);
        }

        const fingerprint = computeFingerprint(allHeaders);

        send({ type: "progress", current: 100, total: 100, phase: "解析完成" });
        send({
          type: "result",
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
        console.error("流式解析失败:", error);
        const message = error instanceof Error ? error.message : "解析失败";
        send({ type: "result", success: false, message });
      }

      controller.close();
    },
  });
}

function handleStreamImport(
  file: File,
  ruleJson: string | null,
  ext: string
): Response {
  const stream = createStream(file, ruleJson, ext);
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

async function handleNonStreamImport(
  file: File,
  ruleJson: string | null,
  ext: string
): Promise<NextResponse> {
  try {
    let rule: ParseRule | undefined;
  if (ruleJson) {
    try {
      const parsed = JSON.parse(ruleJson) as Partial<ParseRule>;
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
    } catch { /* ignore */ }
  }

  const buffer = await file.arrayBuffer();

    // ===== 按格式解析 =====
    let allHeaders: string[] = [];
    let allDataRows: Record<string, string>[] = [];
    let rowCount = 0;
    if (ext === ".xlsx" || ext === ".xls") {
      const parsedSheets = await parseExcelSheets(buffer, rule);

      // 先收集无规则的数据，作为 fallback
      const fallbackDataRows: Record<string, string>[] = [];
      let fallbackHeaders: string[] = [];
      for (const sheet of parsedSheets) {
        fallbackDataRows.push(
          ...sheet.rawRows.map((row) => {
            const mapped: Record<string, string> = {};
            sheet.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
            return mapped;
          })
        );

      }
      if (fallbackDataRows.length > 0) {
        fallbackHeaders = Object.keys(fallbackDataRows[0]);
      }

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

        // 检查是否有标准字段，如果没有，回退到无规则解析
        const hasStandardFields = allHeaders.some((h) => 
          ["external_code", "receiver_store", "receiver_name", "receiver_phone", 
           "receiver_address", "sku_code", "sku_name", "sku_qty", "sku_spec", "remark"].includes(h)
        );
        if (!hasStandardFields) {
          // 回退到无规则的解析方式
          allDataRows = fallbackDataRows;
          allHeaders = fallbackHeaders;
          rowCount = allDataRows.length;
        }
      } else {
        // 无规则：使用所有 sheet 的数据行合并
        allDataRows = fallbackDataRows;
        allHeaders = fallbackHeaders;
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
      
      // 如果有规则，应用规则
      if (rule && rowCount > 0) {
        const context: ParseContext = {
          rawRows: docxResult.dataRows,
          rawHeaders: docxResult.headers,
          sourceName: file.name,
          fullRows: docxResult.fullRows,
        };
        const result = executeRule(rule, context);
        if (result.rows.length > 0) {
          allDataRows = result.rows;
          allHeaders = Object.keys(result.rows[0]);
          rowCount = result.rows.length;
        }
      }
    } else if (ext === ".pdf") {
      const pdfResult = await parsePdf(buffer);
      allHeaders = pdfResult.headers;
      allDataRows = pdfResult.dataRows.map((row) => {
        const mapped: Record<string, string> = {};
        pdfResult.headers.forEach((h, i) => { mapped[h] = row[i] || ""; });
        return mapped;
      });
      rowCount = pdfResult.rowCount;
      
      // 如果有规则，应用规则
      if (rule && rowCount > 0) {
        const context: ParseContext = {
          rawRows: pdfResult.dataRows,
          rawHeaders: pdfResult.headers,
          sourceName: file.name,
          fullRows: pdfResult.fullRows,
        };
        const result = executeRule(rule, context);
        if (result.rows.length > 0) {
          allDataRows = result.rows;
          allHeaders = Object.keys(result.rows[0]);
          rowCount = result.rows.length;
        }
      }
    }

    // 过滤噪声行（卡片式布局中拖尾的合计/单据/收货信息等非明细行）
    if (rule) {
      allDataRows = allDataRows.filter((row) => row.sku_code || row.sku_name);
      rowCount = allDataRows.length;
    }

    if (allDataRows.length === 0) {
      const formatLabel = ext === ".xlsx" || ext === ".xls" ? "Excel"
        : ext === ".docx" ? "Word"
        : ext === ".pdf" ? "PDF"
        : "文件";
      return NextResponse.json({
        success: false,
        message: `未能从${formatLabel}文件「${file.name}」中提取到有效数据行。请使用规则配置来解析此文件格式。`,
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
