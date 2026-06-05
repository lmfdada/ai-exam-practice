import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildOrderRow, validateRow } from "@/lib/orders";

const MAX_ROWS_PER_REQUEST = 200;
const MAX_TOTAL_ROWS = 10000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows: rawRows, batchId } = body;

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ success: false, message: "请提供要提交的数据" }, { status: 400 });
    }

    if (rawRows.length > MAX_TOTAL_ROWS) {
      return NextResponse.json({
        success: false,
        message: `单次提交最多 ${MAX_TOTAL_ROWS} 条数据`,
      }, { status: 400 });
    }

    if (rawRows.length > MAX_ROWS_PER_REQUEST) {
      return NextResponse.json({
        success: false,
        message: `单次提交最多 ${MAX_ROWS_PER_REQUEST} 条，当前 ${rawRows.length} 条，请分批提交`,
      }, { status: 400 });
    }

    const bid = batchId || `batch_${Date.now()}`;
    const sql = getDb();

    // 查询已存在的外部编码+门店组合
    const existingCodeStore = new Set<string>();
    const comboToCheck = rawRows
      .map((r: Record<string, string>) => {
        const code = r.external_code?.trim();
        const store = r.receiver_store?.trim();
        return code ? `${code}::${store || ""}` : null;
      })
      .filter(Boolean) as string[];
    if (comboToCheck.length > 0) {
      const existing = await sql`
        SELECT DISTINCT external_code, receiver_store FROM orders
        WHERE external_code = ANY(${comboToCheck.map((c) => c.split("::")[0])}::varchar[])
      `;
      for (const row of existing as Record<string, unknown>[]) {
        const key = `${String(row.external_code)}::${String(row.receiver_store || "")}`;
        existingCodeStore.add(key);
      }
    }

    // 深度校验
    const validated = rawRows.map((row: Record<string, string>, i: number) => {
      const errors = validateRow(row, i, rawRows, existingCodeStore);
      const orderRow = buildOrderRow(row);
      return { row: orderRow, errors };
    });

    // 校验失败的
    const failed = validated.filter((v: { errors: string[] }) => v.errors.length > 0);
    const successRows = validated.filter((v: { errors: string[] }) => v.errors.length === 0);

    if (successRows.length === 0) {
      return NextResponse.json({ success: false, message: "所有数据校验均未通过", failed: failed.map((f: { errors: string[]; row: Record<string, unknown> }) => ({ errors: f.errors, row: f.row })) });
    }

    // 批量写入——并发单条 INSERT
    const insertedRows: Record<string, unknown>[] = [];
    const writeErrors: { row: Record<string, unknown>; error: string }[] = [];

    if (successRows.length > 0) {
      const insertResults = await Promise.allSettled(
        successRows.map((item: { row: Record<string, unknown> }) => {
          const r = item.row;
          return sql`
            INSERT INTO orders (
              external_code, receiver_store, receiver_name, receiver_phone, receiver_address,
              sku_code, sku_name, sku_qty, sku_spec, remark, batch_id
            ) VALUES (
              ${r.external_code || ""}, ${r.receiver_store || ""}, ${r.receiver_name || ""},
              ${r.receiver_phone || ""}, ${r.receiver_address || ""}, ${r.sku_code || ""},
              ${r.sku_name || ""}, ${r.sku_qty || 0}, ${r.sku_spec || ""}, ${r.remark || ""}, ${bid}
            )
          `;
        })
      );

      for (let idx = 0; idx < insertResults.length; idx++) {
        const res = insertResults[idx];
        if (res.status === "fulfilled") {
          insertedRows.push({ ...successRows[idx].row, id: null });
        } else {
          writeErrors.push({ row: successRows[idx].row, error: res.reason });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `提交完成：成功 ${insertedRows.length} 条，失败 ${failed.length + writeErrors.length} 条`,
      data: {
        batchId: bid,
        insertedCount: insertedRows.length,
        failedCount: failed.length + writeErrors.length,
        failed: [
          ...failed.map((f: { errors: string[]; row: Record<string, unknown> }) => ({ errors: f.errors, row: f.row })),
          ...writeErrors,
        ],
      },
    });
  } catch (error) {
    console.error("提交失败:", error);
    return NextResponse.json({ success: false, message: "提交失败", error: String(error) }, { status: 500 });
  }
}
