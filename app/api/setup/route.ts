import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 删除旧表重建
    await sql`DROP TABLE IF EXISTS orders, template_mappings, parse_rules`;

    // 新 orders 表：SKU 模式
    await sql`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        external_code VARCHAR(200) DEFAULT '',
        receiver_store VARCHAR(200) DEFAULT '',
        receiver_name VARCHAR(100) DEFAULT '',
        receiver_phone VARCHAR(50) DEFAULT '',
        receiver_address TEXT DEFAULT '',
        sku_code VARCHAR(200) NOT NULL DEFAULT '',
        sku_name VARCHAR(500) NOT NULL DEFAULT '',
        sku_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
        sku_spec VARCHAR(200) DEFAULT '',
        remark TEXT DEFAULT '',
        batch_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // 解析规则表
    await sql`
      CREATE TABLE parse_rules (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        file_types TEXT[] DEFAULT '{"xlsx"}',
        config JSONB NOT NULL DEFAULT '{}',
        is_ai_generated BOOLEAN DEFAULT false,
        used_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX idx_orders_external_code ON orders(external_code)
    `;
    await sql`
      CREATE INDEX idx_orders_batch_id ON orders(batch_id)
    `;
    await sql`
      CREATE INDEX idx_orders_created_at ON orders(created_at)
    `;
    await sql`
      CREATE INDEX idx_parse_rules_rule_id ON parse_rules(rule_id)
    `;

    return NextResponse.json({
      success: true,
      message: "✅ 数据库表创建成功！orders (SKU模式) + parse_rules 已就绪。",
    });
  } catch (error) {
    console.error("建表失败:", error);
    return NextResponse.json(
      { success: false, message: "❌ 建表失败", error: String(error) },
      { status: 500 }
    );
  }
}
