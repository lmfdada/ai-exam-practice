import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  external_code TEXT DEFAULT '',
  receiver_store TEXT DEFAULT '',
  receiver_name TEXT DEFAULT '',
  receiver_phone TEXT DEFAULT '',
  receiver_address TEXT DEFAULT '',
  sku_code TEXT NOT NULL DEFAULT '',
  sku_name TEXT NOT NULL DEFAULT '',
  sku_qty REAL NOT NULL DEFAULT 0,
  sku_spec TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  batch_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parse_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_types TEXT DEFAULT '["xlsx"]',
  config TEXT NOT NULL DEFAULT '{}',
  is_ai_generated INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_parse_rules_rule_id ON parse_rules(rule_id);
`;

export async function GET() {
  try {
    const sql = getDb();

    // 删除旧表
    await sql.query(`DROP TABLE IF EXISTS orders`);
    await sql.query(`DROP TABLE IF EXISTS parse_rules`);

    // 重建表
    const statements = CREATE_TABLES_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await sql.query(stmt + ";", []);
    }

    return NextResponse.json({
      success: true,
      message: `✅ 数据库初始化成功！${process.env.DATABASE_URL ? "PostgreSQL" : "SQLite"} 模式，orders + parse_rules 已重建。`,
    });
  } catch (error) {
    console.error("建表失败:", error);
    return NextResponse.json(
      { success: false, message: "❌ 建表失败", error: String(error) },
      { status: 500 }
    );
  }
}
