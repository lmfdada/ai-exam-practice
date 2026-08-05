import { NextResponse } from "next/server";
import { getImportTask, getTaskBatches, getTaskPerformance } from "@/lib/import-tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await getImportTask(taskId);
  if (!task) return NextResponse.json({ success: false, message: "任务不存在" }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: { batches: await getTaskBatches(taskId), performance: await getTaskPerformance(taskId) },
  });
}
