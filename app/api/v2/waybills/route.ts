import { NextRequest, NextResponse } from "next/server";
import { assertV2ApiKey, getSqlOrUnavailable, mapRowsToWaybill, requestId, unauthorized, type V2OrderRow } from "@/lib/v2-api";

export async function GET(request: NextRequest) {
  if (!assertV2ApiKey(request)) return unauthorized();

  const { sql, response } = getSqlOrUnavailable();
  if (!sql) return response;

  const rid = requestId(request);
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
  const updatedAfter = searchParams.get("updatedAfter");
  const externalCode = searchParams.get("externalCode") || "";

  const conditions: string[] = ["external_code IS NOT NULL", "external_code != ''"];
  const values: (string | number)[] = [];
  let idx = 1;

  if (updatedAfter) {
    conditions.push(`created_at >= $${idx}::timestamp`);
    values.push(updatedAfter);
    idx++;
  }
  if (externalCode) {
    conditions.push(`external_code ILIKE $${idx}`);
    values.push(`%${externalCode}%`);
    idx++;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const countRows = await sql.query(`SELECT COUNT(DISTINCT external_code) AS total FROM orders ${where}`, values) as Record<string, unknown>[];
  const total = Number(countRows[0]?.total || 0);

  values.push(pageSize, (page - 1) * pageSize);
  const codeRows = await sql.query(
    `SELECT external_code, MAX(created_at) AS latest_at
     FROM orders ${where}
     GROUP BY external_code
     ORDER BY latest_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  ) as Record<string, unknown>[];

  const codes = codeRows.map((row) => String(row.external_code));
  if (codes.length === 0) {
    return NextResponse.json({ success: true, requestId: rid, data: { items: [], total, page, pageSize } });
  }

  const detailRows = await sql`
    SELECT * FROM orders WHERE external_code = ANY(${codes}::varchar[]) ORDER BY external_code, id ASC
  ` as V2OrderRow[];
  const grouped = new Map<string, V2OrderRow[]>();
  for (const row of detailRows) {
    if (!grouped.has(row.external_code)) grouped.set(row.external_code, []);
    grouped.get(row.external_code)!.push(row);
  }

  return NextResponse.json({
    success: true,
    requestId: rid,
    data: {
      items: Array.from(grouped.values()).map((rows) => mapRowsToWaybill(rows)),
      total,
      page,
      pageSize,
    },
  });
}

