import { NextResponse } from "next/server";
import { getMonitorSummary } from "@/lib/import-tasks";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ success: true, data: await getMonitorSummary() });
}
