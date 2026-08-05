import { NextRequest, NextResponse } from "next/server";
import { getImportTask, getTaskErrorsPage } from "@/lib/import-tasks";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await getImportTask(taskId);
  if (!task) return NextResponse.json({ success: false, message: "任务不存在" }, { status: 404 });

  const url = new URL(request.url);
  const batchParam = url.searchParams.get("batch");
  const filters = {
    batch: batchParam === null || batchParam === "" ? undefined : Number(batchParam),
    errorCode: url.searchParams.get("error_code") || undefined,
  };
  const firstPage = await getTaskErrorsPage(taskId, { ...filters, page: 1, pageSize: 200 });
  const rows = [...firstPage.rows];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    const nextPage = await getTaskErrorsPage(taskId, { ...filters, page, pageSize: 200 });
    rows.push(...nextPage.rows);
  }

  const header = ["task_id", "batch_index", "row_number", "field_name", "raw_value", "error_code", "error_reason", "trace_id", "created_at"];
  const body = rows.map((row) => {
    const record = row as Record<string, unknown>;
    return header.map((key) => csvCell(record[key])).join(",");
  });
  const csv = `\uFEFF${[header.join(","), ...body].join("\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${taskId}-errors.csv"`,
    },
  });
}
