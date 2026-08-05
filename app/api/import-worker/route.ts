import { NextRequest, NextResponse } from "next/server";
import { runImportWorker } from "@/lib/import-tasks";
import { isAuthorizedV4Request } from "@/lib/v4-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedV4Request(request, "V4_WORKER_TOKEN")) {
    return NextResponse.json({ success: false, message: "未授权" }, { status: 401 });
  }
  const limit = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 5)));
  return NextResponse.json({ success: true, data: await runImportWorker(limit) });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
