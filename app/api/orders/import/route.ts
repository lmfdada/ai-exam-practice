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

function parseMetaAfterDataFormat(rows: string[][]): ParsedSheet {
  // 1. 先提取元数据
  const meta: Record<string, string> = {};
  
  // 遍历所有行找包含收货人/收货电话等的行（只找带冒号的）
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] || '').trim();
      if ((cell.startsWith('收货门店：') || cell.includes('收货门店：')) && row[i+1]) {
        meta['收货门店'] = String(row[i+1]).trim();
      }
      if ((cell.startsWith('收货人：') || cell.includes('收货人：') || cell.startsWith('联系人：') || cell.includes('联系人：')) && row[i+1]) {
        meta['收货人'] = String(row[i+1]).trim();
      }
      if ((cell.startsWith('联系电话：') || cell.includes('联系电话：')) && row[i+1]) {
        meta['收货电话'] = String(row[i+1]).trim();
      }
      if ((cell.startsWith('收货地址：') || cell.includes('收货地址：')) && row[i+1]) {
        meta['收货地址'] = String(row[i+1]).trim();
      }
    }
  }

  // 2. 找表头行和原始数据行（不含元数据）
  const headerRowIdx = detectHeaderRow(rows);
  const rawHeaders = rows[headerRowIdx]?.map(h => String(h || '').trim()).filter(h => h) || [];
  
  const dataRows: string[][] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowStr = row.map(c => String(c || '').trim()).join('');
    if (rowStr.includes('合计') || rowStr.includes('单据号') || 
        rowStr.includes('收货门店：') || rowStr.includes('收货人：') ||
        rowStr.includes('联系电话：') || rowStr.includes('收货地址：') ||
        rowStr.includes('制单人：') || rowStr.includes('审核人：') ||
        rowStr.includes('联系人：') || rowStr.includes('上游单据')) continue;
    if (row.some(c => String(c).trim() !== '')) {
      dataRows.push(row);
    }
  }

  // 3. 构建最终的 headers
  const extraHeaders: string[] = [];
  if (meta['收货门店']) extraHeaders.push('收货门店');
  if (meta['收货人']) extraHeaders.push('收货人');
  if (meta['收货电话']) extraHeaders.push('收货电话');
  if (meta['收货地址']) extraHeaders.push('收货地址');
  
  const finalHeaders = [...extraHeaders, ...rawHeaders];
  
  // 4. 构建最终的数据行，直接追加原始行的所有列
  const finalDataRows: string[][] = dataRows.map((originalRow) => {
    const newRow: string[] = [];
    if (meta['收货门店']) newRow.push(meta['收货门店']);
    if (meta['收货人']) newRow.push(meta['收货人']);
    if (meta['收货电话']) newRow.push(meta['收货电话']);
    if (meta['收货地址']) newRow.push(meta['收货地址']);
    
    // 追加原始行的所有列
    for (let i = 0; i < originalRow.length; i++) {
      newRow.push(originalRow[i] || '');
    }
    return newRow;
  });

  return {
    sourceName: 'Meta after data format',
    headers: finalHeaders,
    rawRows: finalDataRows,
    fullRows: rows,
    rowCount: finalDataRows.length,
  };
}

function parseMultiStoreFormat(rows: string[][]): ParsedSheet {
  const headerRow = detectHeaderRow(rows);
  const headers = rows[headerRow]?.map(h => String(h || '').trim()).filter(h => h) || [];
  
  // 识别门店列名
  const storeColIndices: { name: string; index: number }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (['银泰', '金银潭', '金桥', '门店B', '门店D', '收货门店', '门店', '仓库'].some(key => header.includes(key))) {
      storeColIndices.push({ name: header, index: i });
    }
  }

  // 收集非门店列
  const nonStoreHeaders = headers.filter((_, i) => !storeColIndices.some(s => s.index === i));
  
  // 构建最终的表头（加上收货门店）
  const finalHeaders = ['收货门店', ...nonStoreHeaders];
  
  const dataRows: string[][] = [];
  
  // 处理数据行
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const hasData = row.some(c => String(c || '').trim());
    if (!hasData) continue;
    
    // 对每个门店列创建一行
    for (const storeCol of storeColIndices) {
      const qty = row[storeCol.index];
      if (!qty || String(qty).trim() === '' || Number(qty) <= 0) continue;
      
      const newRow: string[] = [storeCol.name];
      
      for (let j = 0; j < headers.length; j++) {
        if (!storeColIndices.some(s => s.index === j)) {
          newRow.push(String(row[j] || ''));
        }
      }
      
      // 替换"在库数量的总和"之类的列，用门店的数量
      for (let j = 0; j < finalHeaders.length; j++) {
        const h = finalHeaders[j];
        if (h.includes('数量') || h.includes('在库')) {
          newRow[j] = String(qty);
        }
      }
      
      dataRows.push(newRow);
    }
  }

  return {
    sourceName: 'Multi store format',
    headers: finalHeaders,
    rawRows: dataRows,
    fullRows: rows,
    rowCount: dataRows.length,
  };
}

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
      const cells = excelRow.values.slice(1).map(c => cellValue(c));
      rows.push(cells);
    });
    if (rows.length === 0) continue;

    // 检测是否是卡片式格式（多个 "▶" 记录标识）（优先级最高）
    const hasCardMarkers = rows.some(r => r.some(c => String(c).includes('▶') || String(c).includes('调拨记录')));
    if (hasCardMarkers) {
      // 处理卡片式格式
      const cardParsed = parseCardFormat(rows);
      result.push(cardParsed);
      continue;
    }

    // 检测是否是多门店格式（表头行有多个列包含不同门店名称，如银泰+金银潭，或银泰+金桥等）
    const multiStoreHeaderRowIdx = detectHeaderRow(rows);
    const multiStoreHeaderRow = rows[multiStoreHeaderRowIdx];
    const storeNamesInHeader = new Set<string>();
    for (const cell of multiStoreHeaderRow) {
      const cellStr = String(cell).trim();
      for (const name of ['银泰', '金银潭', '金桥', '门店B', '门店D']) {
        if (cellStr.includes(name)) {
          storeNamesInHeader.add(name);
          break;
        }
      }
    }
    const hasMultiStoreCols = storeNamesInHeader.size >= 2; // 表头有至少两个不同门店列才触发
    if (hasMultiStoreCols) {
      const parsed = parseMultiStoreFormat(rows);
      result.push(parsed);
      continue;
    }

    // 检测是否是元数据在数据后的格式（后面几行有"收货机构："、"收货人："、"收货电话："、"收货地址："多个字段）
    let has收货机构 = false;
    let has收货人 = false;
    let has收货电话 = false;
    for (const r of rows.slice(-10)) { // 检查最后10行
      for (const c of r) {
        const s = String(c).trim();
        if (s.includes('收货机构：')) has收货机构 = true;
        if (s.includes('收货人：')) has收货人 = true;
        if (s.includes('收货电话：')) has收货电话 = true;
      }
    }
    const hasMetaAtEnd = has收货机构 && has收货人 && has收货电话;
    if (hasMetaAtEnd) {
      const parsed = parseMetaAfterDataFormat(rows);
      result.push(parsed);
      continue;
    }

    // 标准表格格式处理
    const headerRow = rule?.config?.headerDetection === "auto" || !rule
      ? detectHeaderRow(rows)
      : typeof rule?.config?.headerDetection === "object" && "row" in rule.config.headerDetection
        ? rule.config.headerDetection.row
        : detectHeaderRow(rows);

    const rawHeaders = rows[headerRow]?.map((h) => String(h || "").trim()) || [];
    const skipBefore = rule?.config?.skipRowsBeforeHeader ?? 0;
    const dataRows = rows.slice(skipBefore || headerRow + 1)
      .filter((r) => {
        const hasData = r.some((c) => String(c || "").trim() !== "");
        if (!hasData) return false;
        const rowStr = r.map(c => String(c || "").trim()).join('');
        if (rowStr.includes('合计') || rowStr.includes('收货人') || 
            rowStr.includes('联系电话') || rowStr.includes('制单人') || 
            rowStr.includes('审核人') || rowStr.includes('签字') || 
            rowStr.includes('出库日期') || rowStr.includes('仓库：') || 
            rowStr.includes('配送方式') || rowStr.includes('打印时间') ||
            rowStr.includes('收货门店：') || rowStr.includes('收货地址：') ||
            rowStr.includes('联系人：') || rowStr.includes('上游单据')) {
          return false;
        }
        return true;
      });

    // 尝试从所有行里提取收货信息（收货门店、收货人、收货电话、收货地址）
    const extraMeta: Record<string, string> = {};
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        const cell = String(row[i] || "").trim();
        if ((cell.startsWith('收货门店：') || cell.includes('收货门店：')) && row[i+1]) {
          extraMeta['收货门店'] = String(row[i+1]).trim();
        }
        if ((cell.startsWith('收货人：') || cell.includes('收货人：') || cell.startsWith('联系人：') || cell.includes('联系人：')) && row[i+1]) {
          extraMeta['收货人'] = String(row[i+1]).trim();
        }
        if ((cell.startsWith('联系电话：') || cell.includes('联系电话：')) && row[i+1]) {
          extraMeta['收货电话'] = String(row[i+1]).trim();
        }
        if ((cell.startsWith('收货地址：') || cell.includes('收货地址：')) && row[i+1]) {
          extraMeta['收货地址'] = String(row[i+1]).trim();
        }
      }
    }
    // console.log('debug extraMeta:', extraMeta); // 临时debug

    // 先过滤原始 dataRows
    const filteredDataRows = dataRows.filter((r) => {
      const rowStr = r.map(c => String(c || "").trim()).join('');
      if (rowStr.includes('收货门店：') || rowStr.includes('联系电话：') || 
          rowStr.includes('收货地址：') || rowStr.includes('联系人：') || 
          rowStr.includes('制单人：') || rowStr.includes('审核人：')) {
        return false;
      }
      return true;
    });

    let finalHeaders = rawHeaders;
    let finalDataRows = filteredDataRows;

    if (Object.keys(extraMeta).length > 0) {
      // 把收货信息加到表头和每一行数据
      const extraColumns: string[] = [];
      if (extraMeta['收货门店']) extraColumns.push('收货门店');
      if (extraMeta['收货人']) extraColumns.push('收货人');
      if (extraMeta['收货电话']) extraColumns.push('收货电话');
      if (extraMeta['收货地址']) extraColumns.push('收货地址');

      finalHeaders = [...extraColumns, ...rawHeaders];

      finalDataRows = filteredDataRows.map((originalRow) => {
        const newRow: string[] = [];
        if (extraMeta['收货门店']) newRow.push(extraMeta['收货门店']);
        if (extraMeta['收货人']) newRow.push(extraMeta['收货人']);
        if (extraMeta['收货电话']) newRow.push(extraMeta['收货电话']);
        if (extraMeta['收货地址']) newRow.push(extraMeta['收货地址']);
        for (let j = 0; j < originalRow.length; j++) {
          newRow.push(originalRow[j] || '');
        }
        return newRow;
      });
    }

    result.push({
      sourceName: 'Standard table format',
      headers: finalHeaders,
      rawRows: finalDataRows,
      fullRows: rows,
      rowCount: finalDataRows.length,
    });
  }

  return result;
}

function parseCardFormat(rows: string[][]): ParsedSheet {
  const allData: string[][] = [];
  // 我们收集所有可能的列名
  const extraColumns = new Set<string>();

  let currentMeta: Record<string, string> = {};
  let currentHeaders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(c => String(c).trim());
    const joinedRow = row.join(' ');

    // 检测新卡片开始（"▶" 或 "调拨记录"）
    if (joinedRow.includes('▶') || joinedRow.includes('调拨记录')) {
      currentMeta = {};
      currentHeaders = [];
      continue;
    }

    // 检测标题行、合计行
    if (joinedRow.includes('门店调拨单') || joinedRow.includes('合计')) {
      continue;
    }

    // 检测元数据行（"调入门店", "收货人", "电话", "收货地址"）
    const isMetaRow = row.some(c => 
      c.includes('调入门店') || 
      c.includes('收货人') || 
      c.includes('电话') || 
      c.includes('收货地址') ||
      c.includes('门店') ||
      c.includes('地址')
    );

    if (isMetaRow) {
      // 解析键值对格式
      for (let j = 0; j < row.length; j += 2) {
        const key = row[j];
        const value = row[j + 1] || '';
        if (key && key.trim() && !key.includes('调拨单') && !key.includes('合计')) {
          currentMeta[key.trim()] = value.trim();
          extraColumns.add(key.trim());
        }
      }
      continue;
    }

    // 检测表头行（包含 "物品编码", "名称", "数量"）
    const isHeaderRow = row.some(c => 
      c.includes('编码') || 
      c.includes('名称') || 
      c.includes('数量') ||
      c.includes('规格')
    ) && row.length >= 2;

    if (isHeaderRow && currentHeaders.length === 0) {
      currentHeaders = row.filter(c => c.trim() !== '');
      continue;
    }

    // 数据行：必须有内容，并且我们有 meta 和 headers
    const hasData = row.some(c => c.trim() !== '');
    if (hasData && currentHeaders.length > 0) {
      const dataRow: string[] = [];

      // 构建一行数据：先 meta 列，然后是物品数据列
      // 我们收集所有列：先 extraColumns 顺序，然后 currentHeaders
      const orderedHeaders = [...extraColumns, ...currentHeaders];
      
      orderedHeaders.forEach(header => {
        if (currentMeta[header]) {
          dataRow.push(currentMeta[header]);
        } else {
          const idx = currentHeaders.indexOf(header);
          dataRow.push(idx >= 0 ? (row[idx] || '') : '');
        }
      });

      allData.push(dataRow);
    }
  }

  // 最终的 headers
  const finalHeaders = [...extraColumns, ...currentHeaders];

  return {
    sourceName: '卡片式解析',
    headers: finalHeaders,
    rawRows: allData,
    fullRows: rows,
    rowCount: allData.length,
  };
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

  let headers: string[] = [];
  let headerItems: { str: string; x: number }[] = [];
  let useAutoHeaders = false;

  // 首先，看看有没有大量以数字开头的行（类似序号的行）
  const candidateDataLines: { items: { str: string; x: number }[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lineTexts[i];
    if (!text || metadataPrefixes.some((p) => text.startsWith(p))) continue;
    const nonSpaceItems = lines[i].items.filter((it) => it.str.trim().length > 0);
    if (nonSpaceItems.length >= 3) {
      const firstItem = nonSpaceItems[0];
      if (/^\d+$/.test(firstItem.str.trim())) {
        candidateDataLines.push({ items: nonSpaceItems });
      }
    }
  }

  if (candidateDataLines.length > 5) {
    useAutoHeaders = true;
    // 使用第一条数据行的列结构自动构建表头
    headerItems = candidateDataLines[0].items;
    // 自动生成合适的表头
    headers = ['序号', '分类', '编码', '名称', '规格', '单位', '数量'];
  } else if (scoredRows.length > 0) {
    // 最高分的行作为表头行
    scoredRows.sort((a, b) => {
      const sa = scoreRow(a.items.map((i) => i.str));
      const sb = scoreRow(b.items.map((i) => i.str));
      return sb - sa;
    });
    const headerLine = scoredRows[0];
    const rawHeaders = headerLine.items.map((i) => i.str.trim());
    headers = rawHeaders.filter((h) => h.length > 0);
    headerItems = headerLine.items;
  } else {
    throw new Error("未能从 PDF 文件中识别到表格表头");
  }

  // 用表头列的 x 坐标定义列边界（使用中间点分割）
  const colBoundaries: { name: string; minX: number; maxX: number }[] = [];
  for (let j = 0; j < headerItems.length; j++) {
    const name = headers[j] || headerItems[j].str.trim();
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
  if (!useAutoHeaders) {
    for (let i = 0; i < mergedLines.length; i++) {
      if (mergedLines[i].items === headerItems ||
          mergedLines[i].text === headerItems.map((it) => it.str).join(" ")) {
        mergedHeaderIndex = i;
        break;
      }
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
