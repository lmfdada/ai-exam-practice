/**
 * 配送发货单解析规则 — 写入 SQLite 数据库
 *
 * 适用文件: samples/12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx
 * 文件结构:
 *   Row 3 (0-based): 表头行 (序号|物品编码|物品名称|规格型号|...|发货数量|...|备注) — 42列
 *   RowOffset -2: 收货机构信息行
 *   RowOffset  4: 单据号信息行
 *   RowOffset  5: 收货人/电话/地址信息行
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "app.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// 1. 确保 parse_rules 表存在
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

// 2. 生成规则 ID
const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// 3. 规则配置
const config = {
  sheets: "auto",
  headerDetection: { row: 3 },
  columns: [
    { sourceIndex: 2, targetField: "sku_code" },
    { sourceIndex: 3, targetField: "sku_name" },
    { sourceIndex: 5, targetField: "sku_spec" },
    { sourceIndex: 14, targetField: "sku_qty" },
    { sourceIndex: 41, targetField: "remark" },
  ],
  steps: [
    {
      type: "extract_header_fields",
      config: {
        fieldSource: [
          { field: "receiver_store", rowOffset: -2, keyword: "收货机构" },
          { field: "external_code", rowOffset: 4, keyword: "单据号" },
          { field: "receiver_name", rowOffset: 5, keyword: "收货人" },
          { field: "receiver_phone", rowOffset: 5, keyword: "收货电话" },
          { field: "receiver_address", rowOffset: 5, keyword: "收货地址" },
        ],
      },
    },
  ],
};

// 4. 插入规则
const stmt = db.prepare(`
  INSERT INTO parse_rules (rule_id, name, description, file_types, config, is_ai_generated)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const info = stmt.run(
  ruleId,
  "配送发货单解析规则",
  "适用于卡片式布局的配送发货单（头部含收货机构/供货机构，表头行在 Row 3，尾部有合计/单据/收货信息噪声行）",
  JSON.stringify(["xlsx"]),
  JSON.stringify(config),
  0
);

console.log("✅ 规则创建成功！");
console.log(`   规则 ID: ${ruleId}`);
console.log(`   名称: 配送发货单解析规则`);
console.log(`   影响行数: ${info.changes}`);
console.log();
console.log("规则配置摘要:");
console.log(`   headerDetection: { row: 3 }`);
console.log(`   列映射:`);
console.log(`     col 2 (物品编码) → sku_code`);
console.log(`     col 3 (物品名称) → sku_name`);
console.log(`     col 5 (规格型号) → sku_spec`);
console.log(`     col 14 (发货数量) → sku_qty`);
console.log(`     col 41 (备注) → remark`);
console.log(`   后处理器: extract_header_fields`);
console.log(`     rowOffset -2: 收货机构 → receiver_store`);
console.log(`     rowOffset  4: 单据号 → external_code`);
console.log(`     rowOffset  5: 收货人/电话/地址 → receiver_name/phone/address`);

db.close();
