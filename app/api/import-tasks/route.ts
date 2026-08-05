import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createImportTask, runImportWorker } from "@/lib/import-tasks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "请上传文件" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, message: "文件为空" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ success: false, message: "文件大小不能超过 50MB" }, { status: 400 });
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (![".xlsx", ".xls", ".docx"].includes(extension)) {
      return NextResponse.json({ success: false, message: "仅支持 xlsx、xls、docx 文件" }, { status: 400 });
    }
    const rule = String(formData.get("rule") || "");
    if (rule.length > 200_000) {
      return NextResponse.json({ success: false, message: "解析规则过大" }, { status: 400 });
    }
    const task = await createImportTask(file, rule);
    after(() => runImportWorker(1).catch((error) => console.error("[v4] worker failed", error)));
    return NextResponse.json({ success: true, data: task }, { status: 202 });
  } catch (error) {
    console.error("[v4] create import task failed", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "创建导入任务失败" }, { status: 500 });
  }
}
