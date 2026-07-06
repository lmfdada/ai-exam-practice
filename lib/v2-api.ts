import { NextRequest, NextResponse } from "next/server";
import { safeGetDb } from "@/lib/db";

export type V2OrderRow = {
  id: number;
  external_code: string;
  receiver_store: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  sku_code: string;
  sku_name: string;
  sku_qty: number;
  sku_spec: string;
  temperature_layer: string;
  remark: string;
  batch_id: string;
  created_at: string;
};

export function unauthorized() {
  return NextResponse.json({ success: false, message: "V2 API 未授权" }, { status: 401 });
}

export function assertV2ApiKey(request: NextRequest) {
  const expected = process.env.V2_API_KEY || "dev-v2-api-key";
  const actual = request.headers.get("x-api-key") || "";
  return actual === expected;
}

export function requestId(request: NextRequest) {
  return request.headers.get("x-request-id") || `v2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getSqlOrUnavailable() {
  const sql = safeGetDb();
  if (!sql) {
    return {
      sql: null,
      response: NextResponse.json({ success: false, message: "V2 数据库不可用" }, { status: 503 }),
    };
  }
  return { sql, response: null };
}

export function mapRowsToWaybill(rows: V2OrderRow[], source: "v2_realtime" | "cache" | "mock" = "v2_realtime") {
  const first = rows[0];
  const amount = rows.reduce((sum, row) => sum + Number(row.sku_qty || 0) * 100, 0);
  return {
    waybillNo: first.external_code,
    externalCode: first.external_code,
    receiverStore: first.receiver_store,
    receiverName: first.receiver_name,
    receiverPhone: first.receiver_phone,
    receiverAddress: first.receiver_address,
    amount,
    warehouseId: "WH-HN",
    merchantId: "M-ZTOCC",
    source,
    syncedAt: new Date().toISOString(),
    skus: rows.map((row) => ({
      skuCode: row.sku_code,
      skuName: row.sku_name,
      expectedQty: Number(row.sku_qty || 0),
      batchNo: row.batch_id || `BATCH-${row.external_code}`,
      temperatureLayer: row.temperature_layer || "",
      spec: row.sku_spec || "",
      remark: row.remark || "",
    })),
  };
}

