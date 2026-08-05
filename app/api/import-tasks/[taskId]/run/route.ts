import { NextRequest, NextResponse } from "next/server";
import { getImportTask, retryImportTask, runImportWorker } from "@/lib/import-tasks";
import { isAuthorizedV4Request } from "@/lib/v4-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  if (!isAuthorizedV4Request(request, "V4_ADMIN_TOKEN")) {
    return NextResponse.json({ success: false, message: "未授权" }, { status: 401 });
  }
  const { taskId } = await context.params;
  const task = await getImportTask(taskId);
  if (!task) return NextResponse.json({ success: false, message: "任务不存在" }, { status: 404 });
  if (task.status === "FAILED") await retryImportTask(taskId);
  await runImportWorker(1);
  return NextResponse.json({ success: true, data: await getImportTask(taskId) });
}
