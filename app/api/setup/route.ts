import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export async function GET() {
  try {
    const dbDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, "app.db");
    // 关闭已有连接，删除重建
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    // 删除旧表
    db.exec(`DROP TABLE IF EXISTS orders`);
    db.exec(`DROP TABLE IF EXISTS parse_rules`);

    // 建表 - orders
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // 建表 - parse_rules
    db.exec(`
      CREATE TABLE parse_rules (
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

    // 索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_parse_rules_rule_id ON parse_rules(rule_id)`);

    db.close();

    return NextResponse.json({
      success: true,
      message: "✅ SQLite 数据库初始化成功！orders + parse_rules 已重建。",
    });
  } catch (error) {
    console.error("建表失败:", error);
    return NextResponse.json(
      { success: false, message: "❌ 建表失败", error: String(error) },
      { status: 500 }
    );
  }
}
