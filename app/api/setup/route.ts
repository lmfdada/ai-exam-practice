// ====================================
// 数据库建表接口
// 访问 /api/setup 即可自动创建 messages 表
// ====================================
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 创建 messages 表
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        author VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      message: "✅ 数据库表创建成功！messages 表已就绪。",
    });
  } catch (error) {
    console.error("建表失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "❌ 建表失败，请检查 DATABASE_URL 环境变量是否正确配置。",
        error: String(error),
      },
      { status: 500 }
    );
  }
}
