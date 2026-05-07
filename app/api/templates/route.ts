import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fingerprint = searchParams.get("fingerprint");

    const sql = getDb();

    if (fingerprint) {
      const rows = await sql`
        SELECT * FROM template_mappings WHERE fingerprint = ${fingerprint} LIMIT 1
      `;
      if (rows.length > 0) {
        return NextResponse.json({ success: true, data: rows[0] });
      }
      return NextResponse.json({ success: true, data: null });
    }

    const rows = await sql`
      SELECT * FROM template_mappings ORDER BY used_count DESC, created_at DESC
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("查询模板失败:", error);
    return NextResponse.json({ success: false, message: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fingerprint, mapping } = body;

    if (!fingerprint || !mapping) {
      return NextResponse.json({ success: false, message: "参数不完整" }, { status: 400 });
    }

    const sql = getDb();
    const existing = await sql`
      SELECT id FROM template_mappings WHERE fingerprint = ${fingerprint} LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE template_mappings
        SET mapping = ${JSON.stringify(mapping)}::jsonb, used_count = used_count + 1
        WHERE fingerprint = ${fingerprint}
      `;
    } else {
      await sql`
        INSERT INTO template_mappings (fingerprint, mapping)
        VALUES (${fingerprint}, ${JSON.stringify(mapping)}::jsonb)
      `;
    }

    return NextResponse.json({ success: true, message: "模板映射已保存" });
  } catch (error) {
    console.error("保存模板失败:", error);
    return NextResponse.json({ success: false, message: "保存失败" }, { status: 500 });
  }
}
