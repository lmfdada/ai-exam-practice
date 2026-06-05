/**
 * 为新创建的缺失样本添加解析规则
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "app.db");
const db = new Database(dbPath);

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
}

// ===== 1. 周配送计划-复合单元格.xlsx =====
// 结构: Row0-2头部, Row3表头(门店名称|配送商品(编码/名称/规格/数量)|备注|预计送达|配送路线|配送员)
// 配送商品列(B)是复合单元格，格式: "SKU-88001/纯棉圆领T恤（白色）/L/50|SKU-88002/..."
{
  console.log("\n📋 创建周配送计划规则...");
  insertRule(
    "周配送计划复合单元格解析规则",
    "适用于周配送计划-复合单元格.xlsx，B列复合单元格用composite_split拆分",
    ["xlsx"],
    {
      sheets: "auto",
      headerDetection: { row: 3 },
      columns: [
        { sourceIndex: 0, targetField: "receiver_store" },
        { sourceIndex: 1, targetField: "composite_field" },
        { sourceIndex: 2, targetField: "remark" },
      ],
      steps: [
        {
          type: "composite_split",
          config: {
            sourceField: "composite_field",
            rowSeparator: "|",
            separator: "/",
            fieldMapping: {
              sku_code: 0,
              sku_name: 1,
              sku_spec: 2,
              sku_qty: 3,
            },
          },
        },
      ],
    }
  );
}

// ===== 2. 多单配送签收单-多单PDF.pdf =====
{
  console.log("\n📋 创建多单PDF签收单规则...");
  insertRule(
    "多单PDF配送签收单解析规则",
    "适用于多单配送签收单-多单PDF.pdf，多单PDF拆分解析",
    ["pdf"],
    {
      sheets: "auto",
      headerDetection: "auto",
      columns: [
        { sourceHeader: "物品编码", targetField: "sku_code" },
        { sourceHeader: "物品名称", targetField: "sku_name" },
        { sourceHeader: "规格", targetField: "sku_spec" },
        { sourceHeader: "数量", targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "extract_header_fields",
          config: {
            fieldSource: [
              { field: "external_code", keyword: "配送单号" },
              { field: "receiver_store", keyword: "收货门店" },
            ],
          },
        },
      ],
    }
  );
}

const total = db.prepare("SELECT COUNT(*) as c FROM parse_rules").get().c;
console.log(`\n规则总计：${total} 条`);

db.close();
console.log("完成！");
