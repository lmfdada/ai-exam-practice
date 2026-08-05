import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "node:crypto";
import { isAuthorizedV4Request } from "@/lib/v4-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedV4Request(request, "V4_ADMIN_TOKEN")) {
    return NextResponse.json({ success: false, message: "未授权" }, { status: 401 });
  }
  let body: { rows?: Array<{ sku_code?: unknown; name?: unknown; spec?: unknown; unit?: unknown }> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "请求体不是有效 JSON" }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > 50_000) {
    return NextResponse.json({ success: false, message: "单次最多导入 50000 条 SKU" }, { status: 400 });
  }
  if (rows.some((row) => !row || typeof row !== "object" || (row.sku_code !== undefined && typeof row.sku_code !== "string"))) {
    return NextResponse.json({ success: false, message: "SKU 数据格式不正确" }, { status: 400 });
  }
  const sql = getDb();
  await sql.query(`CREATE TABLE IF NOT EXISTS sku_master (sku_code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`);
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const values: unknown[] = [];
    const groups = chunk.map((row, chunkIndex) => {
      const offset = chunkIndex * 5;
      values.push(row.sku_code || `SKU_${index + chunkIndex}`, row.name || "", row.spec || "", row.unit || "", new Date().toISOString());
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5})`;
    });
    if (groups.length) {
      await sql.query(`INSERT INTO sku_master (sku_code,name,spec,unit,created_at) VALUES ${groups.join(",")} ON CONFLICT(sku_code) DO UPDATE SET name=excluded.name,spec=excluded.spec,unit=excluded.unit`, values);
    }
  }
  return NextResponse.json({ success: true, count: rows.length, idempotency_key: crypto.randomUUID() });
}
