import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
    const offset = (page - 1) * pageSize;
    const keyword = searchParams.get("keyword") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const sql = getDb();
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    if (keyword) {
      conditions.push(`(external_code ILIKE $${idx} OR receiver_name ILIKE $${idx} OR sender_name ILIKE $${idx})`);
      values.push(`%${keyword}%`);
      idx++;
    }
    if (startDate) {
      conditions.push(`created_at >= $${idx}`);
      values.push(startDate);
      idx++;
    }
    if (endDate) {
      conditions.push(`created_at < $${idx}::date + 1`);
      values.push(endDate);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await sql.query(`SELECT COUNT(*) as total FROM orders ${where}`, values);
    const total = Number(countResult[0].total);

    values.push(pageSize, offset);
    const rows = await sql.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    return NextResponse.json({ success: true, data: rows, total, page, pageSize });
  } catch (error) {
    console.error("查询运单失败:", error);
    return NextResponse.json({ success: false, message: "查询失败", error: String(error) }, { status: 500 });
  }
}
