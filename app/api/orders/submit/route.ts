import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/orders";

const BATCH_SIZE = 200;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows, batchId: clientBatchId } = body as { rows: Record<string, unknown>[]; batchId?: string };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "提交数据不能为空" },
        { status: 400 }
      );
    }

    if (rows.length > 10000) {
      return NextResponse.json(
        { success: false, message: `单次提交不能超过 10000 条（当前 ${rows.length} 条）` },
        { status: 400 }
      );
    }

    const batchId = clientBatchId || `B${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const sql = getDb();
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
      const batch = rows.slice(batchStart, batchEnd);

      const values = batch.map((r) => ({
        external_code: String(r.external_code || "").trim(),
        sender_name: String(r.sender_name || "").trim(),
        sender_phone: String(r.sender_phone || "").trim(),
        sender_address: String(r.sender_address || "").trim(),
        receiver_name: String(r.receiver_name || "").trim(),
        receiver_phone: String(r.receiver_phone || "").trim(),
        receiver_address: String(r.receiver_address || "").trim(),
        weight: Number(r.weight),
        piece_count: Math.floor(Number(r.piece_count)),
        temperature_level: String(r.temperature_level || "").trim(),
        remark: String(r.remark || "").trim(),
        batch_id: batchId,
      }));

      try {
        const placeholders = values.map(
          (_, i) => `(${[
            `$${i * 13 + 1}`,
            `$${i * 13 + 2}`,
            `$${i * 13 + 3}`,
            `$${i * 13 + 4}`,
            `$${i * 13 + 5}`,
            `$${i * 13 + 6}`,
            `$${i * 13 + 7}`,
            `$${i * 13 + 8}`,
            `$${i * 13 + 9}`,
            `$${i * 13 + 10}`,
            `$${i * 13 + 11}`,
            `$${i * 13 + 12}`,
            `$${i * 13 + 13}`,
          ].join(", ")})`
        ).join(", ");

        const flatValues = values.flatMap((v) => [
          v.external_code,
          v.sender_name,
          v.sender_phone,
          v.sender_address,
          v.receiver_name,
          v.receiver_phone,
          v.receiver_address,
          v.weight,
          v.piece_count,
          v.temperature_level,
          v.remark,
          v.batch_id,
        ]);

        await sql.query(
          `INSERT INTO orders (
            external_code, sender_name, sender_phone, sender_address,
            receiver_name, receiver_phone, receiver_address,
            weight, piece_count, temperature_level, remark, batch_id
          ) VALUES ${placeholders}`,
          flatValues
        );

        successCount += batch.length;
      } catch {
        for (let i = 0; i < batch.length; i++) {
          const rowIndex = batchStart + i;
          try {
            const r = batch[i];
            await sql`
              INSERT INTO orders (
                external_code, sender_name, sender_phone, sender_address,
                receiver_name, receiver_phone, receiver_address,
                weight, piece_count, temperature_level, remark, batch_id
              ) VALUES (
                ${r.external_code},
                ${r.sender_name},
                ${r.sender_phone},
                ${r.sender_address},
                ${r.receiver_name},
                ${r.receiver_phone},
                ${r.receiver_address},
                ${r.weight},
                ${r.piece_count},
                ${r.temperature_level},
                ${r.remark},
                ${batchId}
              )
            `;
            successCount++;
          } catch (rowErr) {
            failCount++;
            errors.push(`第 ${rowIndex + 1} 行提交失败：${String(rowErr)}`);
          }
        }
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
