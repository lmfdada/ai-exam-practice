import { NextRequest, NextResponse } from "next/server";
import { assertV2ApiKey, requestId, unauthorized } from "@/lib/v2-api";

export async function POST(request: NextRequest, context: RouteContext<"/api/v2/waybills/[waybillNo]/exception-marker">) {
  if (!assertV2ApiKey(request)) return unauthorized();

  const rid = requestId(request);
  const { waybillNo } = await context.params;
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({
    success: true,
    requestId: rid,
    message: "V2 已接收异常标记（演示接口，当前版本不修改原始运单表）",
    data: {
      waybillNo: decodeURIComponent(waybillNo),
      hasOpenException: Boolean(body.hasOpenException ?? true),
      sourceTicketId: body.ticketId || "",
      receivedAt: new Date().toISOString(),
    },
  });
}

