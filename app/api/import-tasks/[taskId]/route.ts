import { NextRequest, NextResponse } from "next/server";
import { getImportTask, getTaskErrors } from "@/lib/import-tasks";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await getImportTask(taskId);
  if (!task) return NextResponse.json({ success: false, message: "任务不存在" }, { status: 404 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const errors = await getTaskErrors(taskId, page);
  return NextResponse.json({ success: true, data: { ...task, errors } });
}
