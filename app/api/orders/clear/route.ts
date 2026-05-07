import { NextResponse } from "next/server";
import { getDb } from "@/lib/orders";

export async function POST() {
  try {
    const sql = getDb();
    await sql.query(`DELETE FROM orders`, []);
    await sql.query(`DELETE FROM template_mappings`, []);
    return NextResponse.json({ success: true, message: "✅ 数据已全部清空" });
  } catch (error) {
    console.error("清空数据失败:", error);
    return NextResponse.json({ success: false, message: "清空失败", error: String(error) }, { status: 500 });
  }
}
