import { NextRequest, NextResponse } from "next/server";
import { searchTraceEvents } from "@/lib/import-tasks";

export const runtime = "nodejs";

function readNumber(value: string | null) {
  if (value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const data = await searchTraceEvents({
    traceId: url.searchParams.get("trace_id") || undefined,
    taskId: url.searchParams.get("task_id") || undefined,
    fileName: url.searchParams.get("filename") || undefined,
    batch: readNumber(url.searchParams.get("batch")),
    rowFrom: readNumber(url.searchParams.get("row_from")),
    rowTo: readNumber(url.searchParams.get("row_to")),
    errorCode: url.searchParams.get("error_code") || undefined,
    limit: readNumber(url.searchParams.get("limit")),
  });
  return NextResponse.json({ success: true, data });
}
