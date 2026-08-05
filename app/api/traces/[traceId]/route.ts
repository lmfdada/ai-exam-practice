import { NextResponse } from "next/server";
import { getTaskTrace } from "@/lib/import-tasks";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await context.params;
  return NextResponse.json({ success: true, data: await getTaskTrace(traceId) });
}
