import { NextRequest, NextResponse } from "next/server";
import { safeGetDb } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const sql = safeGetDb();
    if (!sql) {
      return NextResponse.json({
        success: true,
        data: { orders: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
      });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
    const externalCode = searchParams.get("externalCode") || "";
    const receiverName = searchParams.get("receiverName") || "";
    const receiverStore = searchParams.get("receiverStore") || "";
    const skuName = searchParams.get("skuName") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    if (externalCode) {
      conditions.push(`external_code ILIKE $${idx}`);
      values.push(`%${externalCode}%`);
      idx++;
    }
    if (receiverName) {
      conditions.push(`receiver_name ILIKE $${idx}`);
      values.push(`%${receiverName}%`);
      idx++;
    }
    if (receiverStore) {
      conditions.push(`receiver_store ILIKE $${idx}`);
      values.push(`%${receiverStore}%`);
      idx++;
    }
    if (skuName) {
      conditions.push(`sku_name ILIKE $${idx}`);
      values.push(`%${skuName}%`);
      idx++;
    }
    if (startDate) {
      conditions.push(`created_at >= $${idx}::timestamp`);
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

    values.push(pageSize, (page - 1) * pageSize);
    const rows = await sql.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("查询运单失败:", error);
    return NextResponse.json({ success: false, message: "查询失败", error: String(error) }, { status: 500 });
  }
}
