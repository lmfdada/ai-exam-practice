import { NextResponse } from "next/server";
import { getMonitorSummary } from "@/lib/import-tasks";

export const runtime = "nodejs";

let lastAlertAt = 0;

async function sendAlerts(summary: Record<string, unknown>) {
  const webhookUrl = process.env.V4_ALERT_WEBHOOK_URL;
  const alerts = Array.isArray(summary.alerts) ? summary.alerts : [];
  if (!webhookUrl || alerts.length === 0) return;
  if (Date.now() - lastAlertAt < 60_000) return;
  lastAlertAt = Date.now();
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "ai-exam-practice-v4-monitor",
      occurred_at: new Date().toISOString(),
      alerts,
      queue_depth: summary.queue_depth,
      performance: summary.performance,
    }),
  }).catch((error) => console.error("[v4] alert webhook failed", error));
}

export async function GET() {
  const data = await getMonitorSummary();
  void sendAlerts(data as Record<string, unknown>);
  return NextResponse.json({ success: true, data });
}
