import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/orders";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = body as { rows: Record<string, unknown>[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "提交数据不能为空" },
        { status: 400 }
      );
    }

    const batchId = `B${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const sql = getDb();
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        await sql`
          INSERT INTO orders (
            external_code, sender_name, sender_phone, sender_address,
            receiver_name, receiver_phone, receiver_address,
            weight, piece_count, temperature_level, remark, batch_id
          ) VALUES (
            ${String(r.external_code || "").trim()},
            ${String(r.sender_name || "").trim()},
            ${String(r.sender_phone || "").trim()},
            ${String(r.sender_address || "").trim()},
            ${String(r.receiver_name || "").trim()},
            ${String(r.receiver_phone || "").trim()},
            ${String(r.receiver_address || "").trim()},
            ${Number(r.weight)},
            ${Math.floor(Number(r.piece_count))},
            ${String(r.temperature_level || "").trim()},
            ${String(r.remark || "").trim()},
            ${batchId}
          )
        `;
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`第 ${i + 1} 行提交失败：${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `提交完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ""}`,
      data: { successCount, failCount, batchId, errors },
    });
  } catch (error) {
    console.error("提交失败:", error);
    return NextResponse.json(
      { success: false, message: "提交失败", error: String(error) },
      { status: 500 }
    );
  }
}
