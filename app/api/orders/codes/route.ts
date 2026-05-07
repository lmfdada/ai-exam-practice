import { NextResponse } from "next/server";
import { getDb } from "@/lib/orders";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql.query(
      `SELECT DISTINCT external_code FROM orders WHERE external_code IS NOT NULL AND external_code != ''`,
      []
    );
    const codes: string[] = rows.map((r) => String(r.external_code));
    return NextResponse.json({ success: true, data: codes });
  } catch (error) {
    console.error("查询外部编码失败:", error);
    return NextResponse.json({ success: false, data: [] });
  }
}
