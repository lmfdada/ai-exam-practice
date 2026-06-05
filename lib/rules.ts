/**
 * 规则引擎（Rule Engine）
 *
 * 核心设计理念：
 * - 不是为每种文件写硬编码解析逻辑
 * - 通过可配置的规则描述，一套引擎兼容所有格式
 * - 规则由用户手动选择或 AI 生成，不做自动匹配
 * - 新增文件格式只需"配置规则"，代码零改动
 */

// ===== 规则核心类型定义 =====

/** 列映射：将源文件中的列映射到标准字段 */
export interface ColumnMapping {
  /** 源列索引（0-based），与 sourceHeader 二选一 */
  sourceIndex?: number;
  /** 源列表头名称，用于按标题匹配 */
  sourceHeader?: string;
  /** 目标标准字段名 */
  targetField: string;
  /** 默认值（当源列为空时使用） */
  defaultValue?: string;
}

/** 后处理步骤类型 */
export type PostProcessorType =
  | "skip_rows_before_header"
  | "skip_rows_after_header"
  | "extract_tail_info"
  | "extract_header_fields"
  | "aggregate_by_field"
  | "transpose_matrix"
  | "card_split"
  | "composite_split"
  | "multi_sheet_merge"
  | "fill_from_source_name"
  | "static_value"
  | "regex_extract";

/** 后处理步骤配置 */
export interface PostProcessor {
  type: PostProcessorType;
  config: Record<string, unknown>;
}

/** 解析规则完整定义 */
export interface ParseRule {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;

  /** 适用文件类型 */
  fileTypes: ("xlsx" | "xls" | "docx" | "pdf")[];

  /** 解析配置 */
  config: RuleConfig;
}

/** 规则配置详情 */
export interface RuleConfig {
  /** Sheet/页面选择：'auto' 自动 | 'all' 全部合并 | number[] 指定索引 */
  sheets: "auto" | "all" | number[];

  /** 表头检测：'auto' 自动检测 | { row: number } 固定行号 */
  headerDetection: "auto" | { row: number };

  /** 表头前跳过的行数（用于 auto 模式） */
  skipRowsBeforeHeader?: number;

  /** 数据起始行（不设置则默认表头行+1） */
  dataStartRow?: number;

  /** 列映射配置 */
  columns: ColumnMapping[];

  /** 后处理步骤 */
  steps: PostProcessor[];
}

// ===== 规则引擎执行器 =====

export interface ParseContext {
  /** 数据行（表头之后） */
  rawRows: string[][];
  /** 原始表头 */
  rawHeaders: string[];
  /** 选中的 sheet/页面名称 */
  sourceName: string;
  /** 全量原始行（含表头及上方信息行），供 extract_header_fields 等后处理器使用 */
  fullRows?: string[][];
}

export interface ParseResult {
  rows: Record<string, string>[];
  errors: string[];
}

/**
 * 根据规则执行解析
 */
export function executeRule(rule: ParseRule, context: ParseContext): ParseResult {
  let rows = applyColumnMapping(rule, context);
  rows = applyPostProcessors(rule, rows, context);
  return { rows, errors: [] };
}

/**
 * 列映射：将原始数据转换为标准字段格式
 */
function applyColumnMapping(rule: ParseRule, context: ParseContext): Record<string, string>[] {
  const { rawRows, rawHeaders } = context;
  const { columns } = rule.config;

  if (columns.length === 0) {
    // 无映射配置时，直接用列位置映射
    return rawRows.map((row) => {
      const mapped: Record<string, string> = {};
      rawHeaders.forEach((h, i) => {
        mapped[h] = row[i] || "";
      });
      return mapped;
    });
  }

  return rawRows.map((row) => {
    const mapped: Record<string, string> = {};

    for (const col of columns) {
      let value = "";

      if (col.sourceIndex !== undefined && col.sourceIndex < row.length) {
        value = row[col.sourceIndex] || "";
      } else if (col.sourceHeader) {
        // 按表头名称查找列索引
        const idx = rawHeaders.findIndex(
          (h) => h.toLowerCase().trim() === col.sourceHeader!.toLowerCase().trim()
        );
        if (idx >= 0 && idx < row.length) {
          value = row[idx] || "";
        }
      }

      if (!value && col.defaultValue !== undefined) {
        value = col.defaultValue;
      }

      mapped[col.targetField] = value;
    }

    return mapped;
  });
}

/**
 * 后处理：执行规则中配置的各个步骤
 */
function applyPostProcessors(
  rule: ParseRule,
  rows: Record<string, string>[],
  context: ParseContext
): Record<string, string>[] {
  let result = [...rows];

  for (const step of rule.config.steps) {
    switch (step.type) {
      case "skip_rows_before_header":
        // 已经在上层处理，跳过
        break;
      case "skip_rows_after_header":
        result = applySkipRowsAfterHeader(result, step.config);
        break;
      case "extract_tail_info":
        result = applyExtractTailInfo(result, context, step.config);
        break;
      case "extract_header_fields":
        result = applyExtractHeaderFields(result, context, step.config);
        break;
      case "aggregate_by_field":
        result = applyAggregateByField(result, step.config);
        break;
      case "transpose_matrix":
        result = applyTransposeMatrix(result, step.config);
        break;
      case "composite_split":
        result = applyCompositeSplit(result, step.config);
        break;
      case "fill_from_source_name":
        result = applyFillFromSourceName(result, context, step.config);
        break;
      case "static_value":
        result = applyStaticValue(result, step.config);
        break;
      case "regex_extract":
        result = applyRegexExtract(result, step.config);
        break;
    }
  }

  return result;
}

function applySkipRowsAfterHeader(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  const count = (config.count as number) || 0;
  return rows.slice(count);
}

function applyExtractTailInfo(
  rows: Record<string, string>[],
  context: ParseContext,
  config: Record<string, unknown>
): Record<string, string>[] {
  // 从尾部提取信息，应用到所有行
  const rowCount = (config.rowCount as number) || 1;
  const fieldMapping = config.fieldMapping as Record<string, number> || {};

  if (context.rawRows.length < rowCount) return rows;

  const tailRows = context.rawRows.slice(-rowCount);
  const tailData: Record<string, string> = {};

  for (const [field, rowOffset] of Object.entries(fieldMapping)) {
    const idx = Math.abs(rowOffset);
    if (idx <= tailRows.length && tailRows[tailRows.length - idx].length > 0) {
      tailData[field] = tailRows[tailRows.length - idx][0] || "";
    }
  }

  return rows.map((row) => ({ ...row, ...tailData }));
}

function applyAggregateByField(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  const field = config.field as string;
  if (!field) return rows;

  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const key = row[field] || "__no_key__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  // 合并同组：保留第一行的收货信息，合并 SKU 行
  const result: Record<string, string>[] = [];
  for (const [, group] of grouped) {
    const base = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      // 合并 SKU 信息用分号分隔
      if (group[i].sku_code) base.sku_code += "; " + group[i].sku_code;
      if (group[i].sku_name) base.sku_name += "; " + group[i].sku_name;
      if (group[i].sku_qty) base.sku_qty = String(Number(base.sku_qty || 0) + Number(group[i].sku_qty));
      if (group[i].sku_spec) base.sku_spec += "; " + group[i].sku_spec;
    }
    result.push(base);
  }

  return result;
}

function applyTransposeMatrix(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  // 矩阵转置：将列头作为数据行
  const rowField = config.rowField as string; // SKU 所在列
  const colFields = config.colFields as string[]; // 需要转置的列头
  const valueField = config.valueField as string; // 转置后的值字段

  if (!rowField || !colFields || colFields.length === 0) return rows;

  const result: Record<string, string>[] = [];

  for (const row of rows) {
    for (const col of colFields) {
      const newRow: Record<string, string> = {
        ...row,
        [valueField || "sku_qty"]: row[col] || "0",
        receiver_store: col, // 门店名作为收货门店
      };
      // 删除已转置的列值
      for (const cf of colFields) {
        delete newRow[cf];
      }
      result.push(newRow);
    }
  }

  return result;
}

function applyStaticValue(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  const field = config.field as string;
  const value = config.value as string;
  if (!field) return rows;

  return rows.map((row) => ({ ...row, [field]: value }));
}

function applyRegexExtract(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  const sourceField = config.sourceField as string;
  const pattern = config.pattern as string;
  const targetField = config.targetField as string;

  if (!sourceField || !pattern || !targetField) return rows;

  const regex = new RegExp(pattern, "i");

  return rows.map((row) => {
    const val = row[sourceField] || "";
    const match = val.match(regex);
    if (match) {
      row[targetField] = match[1] || match[0];
    }
    return row;
  });
}

/**
 * extract_header_fields: 从表头上方提取卡片式字段信息
 * 适用场景：门店调拨单等卡片式布局，表头行上方有 调入门店、收货人、电话、地址 等信息
 * 配置示例：
 *   {
 *     fieldSource: [
 *       { field: "receiver_store", rowOffset: -2, ... }
 *     ]
 *   }
 */
function applyExtractHeaderFields(
  rows: Record<string, string>[],
  context: ParseContext,
  config: Record<string, unknown>
): Record<string, string>[] {
  const fieldSource = config.fieldSource as Array<{ field: string; rowOffset: number; colIndex?: number; keyword?: string }>;
  if (!fieldSource || !Array.isArray(fieldSource)) return rows;

  // 从 fullRows（全量原始行）中提取卡片头信息
  const headerData: Record<string, string> = {};
  const searchRows = context.fullRows || context.rawRows;

  // 获取表头行索引
  const KNOWN_HEADER_KEYWORDS = [
    "编码", "名称", "数量", "门店", "地址", "电话", "手机", "姓名",
    "SKU", "规格", "备注", "单号", "订单", "配送", "收货",
    "序号", "编号", "货号", "品名", "物料", "仓库",
  ];
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(searchRows.length, 20); i++) {
    let score = 0;
    for (const cell of searchRows[i]) {
      const s = String(cell || "").trim();
      if (s.length > 10) continue;
      for (const kw of KNOWN_HEADER_KEYWORDS) {
        if (s.includes(kw)) { score++; break; }
      }
    }
    if (score > 3) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) headerRowIdx = 2; // fallback

  for (const fs of fieldSource) {
    const targetRowIdx = headerRowIdx + fs.rowOffset;
    if (targetRowIdx < 0 || targetRowIdx >= searchRows.length) continue;

    const targetRow = searchRows[targetRowIdx];
    if (!targetRow || targetRow.length === 0) continue;

    if (fs.keyword) {
      // 按关键词查找：遍历该行全部单元格，找到包含关键词的单元格，下一个单元格即为值
      for (let ci = 0; ci < targetRow.length - 1; ci++) {
        if (targetRow[ci].includes(fs.keyword)) {
          headerData[fs.field] = targetRow[ci + 1] || "";
          break;
        }
      }
    } else if (fs.colIndex !== undefined && fs.colIndex >= 0) {
      // 按固定列索引
      headerData[fs.field] = targetRow[fs.colIndex] || "";
    } else {
      // 默认取第一列
      headerData[fs.field] = targetRow[0] || "";
    }
  }

  // 应用到每一行
  if (Object.keys(headerData).length === 0) return rows;
  return rows.map((row) => ({ ...row, ...headerData }));
}

/**
 * composite_split: 拆分组合单元格
 * 适用场景：如 "张三/13800138000" 拆分为姓名和电话
 */
function applyCompositeSplit(
  rows: Record<string, string>[],
  config: Record<string, unknown>
): Record<string, string>[] {
  const sourceField = config.sourceField as string;
  const separator = (config.separator as string) || "/";
  const fieldMapping = config.fieldMapping as Record<string, number> || {};

  if (!sourceField) return rows;

  return rows.map((row) => {
    const val = row[sourceField] || "";
    if (!val.includes(separator)) return row;

    const parts = val.split(separator);
    for (const [targetField, partIdx] of Object.entries(fieldMapping)) {
      if (partIdx < parts.length) {
        row[targetField] = parts[partIdx].trim();
      }
    }
    return row;
  });
}

/**
 * fill_from_source_name: 用来源名称（Sheet名/页面名）填充指定字段
 * 适用场景：多门店分Sheet，用Sheet名填充 receiver_store
 */
function applyFillFromSourceName(
  rows: Record<string, string>[],
  context: ParseContext,
  config: Record<string, unknown>
): Record<string, string>[] {
  const targetField = config.targetField as string;
  if (!targetField) return rows;

  const sourceName = context.sourceName || "";
  if (!sourceName) return rows;

  return rows.map((row) => ({ ...row, [targetField]: sourceName }));
}

// ===== 工具函数 =====

/** 生成唯一 ID */
export function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建默认空规则 */
export function createEmptyRule(): ParseRule {
  const now = new Date().toISOString();
  return {
    id: generateRuleId(),
    name: "",
    description: "",
    createdAt: now,
    updatedAt: now,
    fileTypes: ["xlsx"],
    config: {
      sheets: "auto",
      headerDetection: "auto",
      columns: [],
      steps: [],
    },
  };
}
