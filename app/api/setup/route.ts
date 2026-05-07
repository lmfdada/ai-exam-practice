import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    await sql`DROP TABLE IF EXISTS orders, template_mappings`;

    await sql`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        external_code VARCHAR(100) DEFAULT '',
        sender_name VARCHAR(100) NOT NULL,
        sender_phone VARCHAR(50) NOT NULL,
        sender_address TEXT NOT NULL,
        receiver_name VARCHAR(100) NOT NULL,
        receiver_phone VARCHAR(50) NOT NULL,
        receiver_address TEXT NOT NULL,
        weight DECIMAL(10,2) NOT NULL,
        piece_count INTEGER NOT NULL,
        temperature_level VARCHAR(10) NOT NULL,
        remark TEXT DEFAULT '',
        batch_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE template_mappings (
        id SERIAL PRIMARY KEY,
        fingerprint VARCHAR(255) NOT NULL UNIQUE,
        mapping JSONB NOT NULL,
        used_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
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

    return NextResponse.json({
      success: true,
      message: "✅ 数据库表创建成功！orders + template_mappings 已就绪。",
    });
  } catch (error) {
    console.error("建表失败:", error);
    return NextResponse.json(
      { success: false, message: "❌ 建表失败", error: String(error) },
      { status: 500 }
    );
  }
}
