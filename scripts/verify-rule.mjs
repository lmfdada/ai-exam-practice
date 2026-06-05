/**
 * 验证配送发货单解析规则已成功写入
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "app.db");
const db = new Database(dbPath);

const rows = db.prepare("SELECT * FROM parse_rules ORDER BY created_at DESC LIMIT 5").all();

console.log(`数据库中共 ${rows.length} 条规则:\n`);

for (const row of rows) {
  console.log(`━━━ ${row.name} ━━━`);
  console.log(`  rule_id:    ${row.rule_id}`);
  console.log(`  description: ${row.description}`);
  console.log(`  file_types:  ${row.file_types}`);
  console.log(`  created_at:  ${row.created_at}`);
  
  try {
    const config = JSON.parse(row.config);
    console.log(`  headerDetection:`, JSON.stringify(config.headerDetection));
    console.log(`  columns (${config.columns.length} 项):`);
    for (const col of config.columns) {
      console.log(`    col ${col.sourceIndex} → ${col.targetField}`);
    }
    console.log(`  steps (${config.steps?.length || 0} 项):`);
    for (const step of config.steps || []) {
      console.log(`    type: ${step.type}`);
      if (step.config?.fieldSource) {
        for (const fs of step.config.fieldSource) {
          console.log(`      rowOffset ${fs.rowOffset}, keyword="${fs.keyword}" → ${fs.field}`);
        }
      }
    }
  } catch (e) {
    console.log(`  config: ${row.config}`);
  }
  console.log();
}

db.close();
