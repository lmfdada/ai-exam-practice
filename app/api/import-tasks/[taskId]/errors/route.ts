import { NextRequest, NextResponse } from "next/server";
import { getImportTask, getTaskErrorsPage } from "@/lib/import-tasks";

export const runtime = "nodejs";

function readFilters(request: NextRequest) {
  const url = new URL(request.url);
  const batchParam = url.searchParams.get("batch");
  return {
    page: Number(url.searchParams.get("page") || 1),
    pageSize: Number(url.searchParams.get("page_size") || 50),
    batch: batchParam === null || batchParam === "" ? undefined : Number(batchParam),
    errorCode: url.searchParams.get("error_code") || undefined,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await getImportTask(taskId);
  if (!task) return NextResponse.json({ success: false, message: "任务不存在" }, { status: 404 });
  const page = await getTaskErrorsPage(taskId, readFilters(request));
  return NextResponse.json({ success: true, data: page });
}
