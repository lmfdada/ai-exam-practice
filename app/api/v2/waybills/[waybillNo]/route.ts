import { NextRequest, NextResponse } from "next/server";
import { assertV2ApiKey, getSqlOrUnavailable, mapRowsToWaybill, requestId, unauthorized, type V2OrderRow } from "@/lib/v2-api";

export async function GET(request: NextRequest, context: RouteContext<"/api/v2/waybills/[waybillNo]">) {
  if (!assertV2ApiKey(request)) return unauthorized();

  const { sql, response } = getSqlOrUnavailable();
  if (!sql) return response;

  const rid = requestId(request);
  const { waybillNo } = await context.params;
  const rows = await sql`
    SELECT * FROM orders WHERE external_code = ${decodeURIComponent(waybillNo)} ORDER BY id ASC
  ` as V2OrderRow[];

  if (rows.length === 0) {
    return NextResponse.json({ success: false, requestId: rid, message: "运单不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, requestId: rid, data: mapRowsToWaybill(rows) });
}

