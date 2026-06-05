/**
 * 批量创建解析规则脚本
 * 为 samples 目录下所有文件创建对应的解析规则
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 连接数据库
const dbPath = path.join(__dirname, "..", "data", "app.db");
const db = new Database(dbPath);

// 确保 parse_rules 表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS parse_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    file_types TEXT DEFAULT '["xlsx"]',
    config TEXT NOT NULL DEFAULT '{}',
    is_ai_generated INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

function generateRuleId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function insertRule(name, description, fileTypes, config) {
  const ruleId = generateRuleId();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO parse_rules (rule_id, name, description, file_types, config, is_ai_generated, used_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  `);
  stmt.run(ruleId, name, description, JSON.stringify(fileTypes), JSON.stringify(config), now, now);
  console.log(`  ✅ 已创建规则: ${name} (${ruleId})`);
  return ruleId;
}

// ===== 规则定义 =====

const rules = [
  // ========== 1. 湖南仓.xlsx ==========
  // 结构: Row0=提示信息, Row1=表头(32列), Row2+=数据行
  // 关键列: 收货机构(0), 配送汇总单号(1)=external_code, 物品编码(5)=sku_code,
  //         物品名称(6)=sku_name, 规格型号(8)=sku_spec, 发货数量(12)=sku_qty,
  //         收货人(26)=receiver_name, 收货电话(27)=receiver_phone, 收货地址(28)=receiver_address
  {
    name: "湖南仓发货明细解析规则",
    description: "适用于湖南仓.xlsx 格式，Row0提示行，Row1表头，32列标准出库单",
    fileTypes: ["xlsx"],
    config: {
      sheets: "auto",
      headerDetection: { row: 1 },
      skipRowsBeforeHeader: 1,
      columns: [
        { sourceIndex: 0, targetField: "receiver_store" },
        { sourceIndex: 1, targetField: "external_code" },
        { sourceIndex: 5, targetField: "sku_code" },
        { sourceIndex: 6, targetField: "sku_name" },
        { sourceIndex: 8, targetField: "sku_spec" },
        { sourceIndex: 12, targetField: "sku_qty" },
        { sourceIndex: 26, targetField: "receiver_name" },
        { sourceIndex: 27, targetField: "receiver_phone" },
        { sourceIndex: 28, targetField: "receiver_address" },
      ],
      steps: [],
    },
  },

  // ========== 2. 欢乐牧场模板0430.xlsx ==========
  // 结构: 矩阵转置格式，Row0表头，列0-12为固定信息，列13+为门店
  // 门店列: 银泰(13), 金银潭(14), 金桥(15)
  {
    name: "欢乐牧场库存模板解析规则",
    description: "适用于欢乐牧场模板0430.xlsx，矩阵转置格式，将门店列转为行",
    fileTypes: ["xlsx"],
    config: {
      sheets: "auto",
      headerDetection: { row: 0 },
      columns: [
        { sourceHeader: "外部商品编码", targetField: "sku_code" },
        { sourceHeader: "SKU名称", targetField: "sku_name" },
        { sourceHeader: "规格", targetField: "sku_spec" },
      ],
      steps: [
        {
          type: "transpose_matrix",
          config: {
            storeColumns: [
              { header: "银泰", storeName: "银泰店" },
              { header: "金银潭", storeName: "金银潭店" },
              { header: "金桥", storeName: "金桥店" },
            ],
            quantityField: "sku_qty",
            storeField: "receiver_store",
          },
        },
      ],
    },
  },

  // ========== 3. 多门店分Sheet出库单.xlsx ==========
  // 结构: 多Sheet，每个Sheet一个门店
  // Sheet内: Row0=门店名称标题, Row1=日期仓库, Row3=表头(序号|物品编码|物品名称|规格型号|单位|出库数量|仓库|备注)
  // Row4+=数据行，尾部有合计行和收货信息
  {
    name: "多门店分Sheet出库单解析规则",
    description: "适用于多门店分Sheet出库单.xlsx，每个Sheet一个门店，Row3表头，尾部提取收货信息",
    fileTypes: ["xlsx"],
    config: {
      sheets: "auto",
      headerDetection: { row: 3 },
      columns: [
        { sourceIndex: 1, targetField: "sku_code" },
        { sourceIndex: 2, targetField: "sku_name" },
        { sourceIndex: 3, targetField: "sku_spec" },
        { sourceIndex: 5, targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "fill_from_source_name",
          config: {
            targetField: "receiver_store",
          },
        },
        {
          type: "extract_tail_info",
          config: {
            keyword: "收货门店",
            mappings: [
              { field: "receiver_store", keyword: "收货门店" },
              { field: "receiver_name", keyword: "联系人" },
              { field: "receiver_phone", keyword: "联系电话" },
              { field: "receiver_address", keyword: "收货地址" },
            ],
          },
        },
      ],
    },
  },

  // ========== 4. 多门店汇总-多Sheet出库单.xlsx ==========
  // 结构: 3 Sheets - 汇总信息(无明细), 黎明屯明细(Row0表头), 湖南仓明细(Row0表头)
  // 明细Sheet: 外部单号(0)|物品编码(1)|物品名称(2)|规格型号(3)|数量(4)|备注(5)
  {
    name: "多门店汇总出库单解析规则",
    description: "适用于多门店汇总-多Sheet出库单.xlsx，多Sheet合并+Sheet名填充门店",
    fileTypes: ["xlsx"],
    config: {
      sheets: ["黎明屯明细", "湖南仓明细"],
      headerDetection: { row: 0 },
      columns: [
        { sourceIndex: 0, targetField: "external_code" },
        { sourceIndex: 1, targetField: "sku_code" },
        { sourceIndex: 2, targetField: "sku_name" },
        { sourceIndex: 3, targetField: "sku_spec" },
        { sourceIndex: 4, targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "multi_sheet_merge",
          config: {},
        },
        {
          type: "fill_from_source_name",
          config: {
            targetField: "receiver_store",
          },
        },
      ],
    },
  },

  // ========== 5. 门店调拨单-卡片式.xlsx ==========
  // 结构: 多个卡片(调拨记录#1, #2...)，每个卡片有调入门店/收货人/电话/地址信息
  // 卡片内: Row6(表头:物品编码|物品名称|规格|数量), Row7+数据
  {
    name: "门店调拨单卡片式解析规则",
    description: "适用于门店调拨单-卡片式.xlsx，多个卡片连续排列，card_split拆分+提取头字段",
    fileTypes: ["xlsx"],
    config: {
      sheets: "auto",
      headerDetection: { row: 6 },
      columns: [
        { sourceIndex: 0, targetField: "sku_code" },
        { sourceIndex: 1, targetField: "sku_name" },
        { sourceIndex: 2, targetField: "sku_spec" },
        { sourceIndex: 3, targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "card_split",
          config: {
            cardKeywords: ["调拨记录"],
            fieldSource: [
              { field: "receiver_store", keyword: "调入门店", rowOffset: -2 },
              { field: "receiver_name", keyword: "收货人", rowOffset: -2 },
              { field: "receiver_phone", keyword: "电话", rowOffset: -2 },
              { field: "receiver_address", keyword: "收货地址", rowOffset: -1 },
            ],
          },
        },
      ],
    },
  },

  // ========== 6. 配送发货单-DOCX格式.docx ==========
  // Word文档，文本表格格式
  // 配送单号/日期/发货方/收货方, 表头(序号|物品编码|物品名称|规格型号|单位|数量|备注)
  {
    name: "配送发货单DOCX解析规则",
    description: "适用于配送发货单-DOCX格式.docx Word文档格式",
    fileTypes: ["docx"],
    config: {
      sheets: "auto",
      headerDetection: "auto",
      columns: [
        { sourceHeader: "物品编码", targetField: "sku_code" },
        { sourceHeader: "物品名称", targetField: "sku_name" },
        { sourceHeader: "规格型号", targetField: "sku_spec" },
        { sourceHeader: "数量", targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "extract_header_fields",
          config: {
            fieldSource: [
              { field: "external_code", keyword: "配送单号" },
              { field: "receiver_store", keyword: "收货方" },
            ],
          },
        },
      ],
    },
  },

  // ========== 7. 批量出库单-标准CSV格式.csv ==========
  // 标准CSV: 外部单号,门店名称,物品编码,物品名称,发货数量,规格型号,备注
  {
    name: "标准CSV出库单解析规则",
    description: "适用于批量出库单-标准CSV格式.csv 标准CSV格式，header在第0行",
    fileTypes: ["csv"],
    config: {
      sheets: "auto",
      headerDetection: { row: 0 },
      columns: [
        { sourceIndex: 0, targetField: "external_code" },
        { sourceIndex: 1, targetField: "receiver_store" },
        { sourceIndex: 2, targetField: "sku_code" },
        { sourceIndex: 3, targetField: "sku_name" },
        { sourceIndex: 4, targetField: "sku_qty" },
        { sourceIndex: 5, targetField: "sku_spec" },
        { sourceIndex: 6, targetField: "remark" },
      ],
      steps: [],
    },
  },

  // ========== 8. 黔寨寨贵州烙锅（鞍山店）常温.pdf ==========
  // PDF格式配送单
  {
    name: "黔寨寨配送单PDF解析规则",
    description: "适用于黔寨寨贵州烙锅（鞍山店）常温.pdf PDF格式配送单",
    fileTypes: ["pdf"],
    config: {
      sheets: "auto",
      headerDetection: "auto",
      columns: [
        { sourceHeader: "物品编码", targetField: "sku_code" },
        { sourceHeader: "物品名称", targetField: "sku_name" },
        { sourceHeader: "规格型号", targetField: "sku_spec" },
        { sourceHeader: "数量", targetField: "sku_qty" },
      ],
      steps: [],
    },
  },
];

// 批量插入
console.log("开始创建解析规则...\n");
for (const rule of rules) {
  insertRule(rule.name, rule.description, rule.fileTypes, rule.config);
}

// 验证
console.log("\n规则总计：", db.prepare("SELECT COUNT(*) as c FROM parse_rules").get().c);

db.close();
console.log("\n全部规则创建完成！");
