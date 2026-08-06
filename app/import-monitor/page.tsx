"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
  tasks: Array<{ status: string; count: number }>;
  queue_depth: number;
  errors: Array<{ error_code: string; count: number }>;
  performance: { avg_duration_ms?: number; max_duration_ms?: number };
  alerts: Array<{ level: string; code: string; message: string }>;
  stage_metrics: Record<string, { p50: number; p95: number; p99: number; max: number }>;
  recentTasks: Array<{
    task_id: string;
    status: string;
    total_rows: number;
    processed_rows: number;
    success_rows: number;
    failed_rows: number;
    total_batches: number;
    completed_batches: number;
    created_at: string;
  }>;
  recentBatches: Array<{
    task_id: string;
    batch_index: number;
    status: string;
    parse_duration_ms: number;
    rule_duration_ms: number;
    validate_duration_ms: number;
    insert_duration_ms: number;
    total_duration_ms: number;
    processed_rows: number;
    success_rows: number;
    failed_rows: number;
    created_at: string;
  }>;
  recentErrors: Array<{
    task_id: string;
    batch_index: number;
    row_number: number;
    error_code: string;
    error_reason: string;
    created_at: string;
  }>;
};

type Bucket = { label: string; value: number };

export default function ImportMonitorPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  async function load() {
    const response = await fetch("/api/import-monitor/summary", { cache: "no-store" });
    const json = await response.json();
    if (json.success) {
      setSummary(json.data);
      setLastUpdated(new Date().toLocaleTimeString("zh-CN"));
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, []);

  const taskCount = (status: string) => summary?.tasks.find((item) => item.status === status)?.count ?? 0;
  const throughput = useMemo(() => buildThroughput(summary?.recentBatches ?? []), [summary]);
  const stageStats = useMemo(() => buildStageStats(summary), [summary]);

  return (
    <div className="v4-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OBSERVABILITY</div>
          <h1>导入监控</h1>
          <p>实时查看任务状态、队列积压、吞吐变化、阶段耗时和错误类型。</p>
        </div>
        <div className="v4-message">每 3 秒刷新 · {lastUpdated || "加载中"}</div>
      </div>

      <section className="monitor-grid">
        <MonitorCard label="队列积压" value={summary?.queue_depth ?? "-"} hint="待投递或处理中事件" tone={(summary?.queue_depth ?? 0) > 10 ? "warning" : "normal"} />
        <MonitorCard label="处理中任务" value={taskCount("PROCESSING")} hint="当前正在消费" />
        <MonitorCard label="失败任务" value={taskCount("FAILED")} hint="需要重试或排查" tone={taskCount("FAILED") ? "danger" : "normal"} />
        <MonitorCard label="批次 P99" value={summary?.stage_metrics?.total_duration_ms?.p99 ? `${summary.stage_metrics.total_duration_ms.p99} ms` : "-"} hint={`最大 ${summary?.performance.max_duration_ms ?? "-"} ms`} tone={(summary?.stage_metrics?.total_duration_ms?.p99 ?? 0) > 10000 ? "warning" : "normal"} />
      </section>

      {summary?.alerts?.length ? (
        <section className="monitor-panel monitor-alert-panel">
          <div className="section-title-row"><h2>当前告警</h2><span className="v4-message">可配置 V4_ALERT_WEBHOOK_URL 主动通知</span></div>
          {summary.alerts.map((alert) => (
            <div className={`monitor-row alert-${alert.level}`} key={alert.code}>
              <span>{alert.code}</span>
              <strong>{alert.message}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <section className="monitor-columns">
        <div className="monitor-panel">
          <div className="section-title-row"><h2>最近 5 分钟吞吐</h2><a href="/import-tasks">打开任务工作台</a></div>
          <MiniBars bars={throughput} suffix="行" />
        </div>
        <div className="monitor-panel">
          <div className="section-title-row"><h2>阶段耗时分布</h2><span className="v4-message">最近批次</span></div>
          {stageStats.map((item) => (
            <div className="monitor-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="monitor-columns">
        <div className="monitor-panel">
          <div className="section-title-row"><h2>任务状态</h2></div>
          {["PENDING", "PROCESSING", "COMPLETED", "PARTIAL_SUCCESS", "FAILED"].map((status) => (
            <div className="monitor-row" key={status}><span>{statusLabel(status)}</span><strong>{taskCount(status)}</strong></div>
          ))}
        </div>
        <div className="monitor-panel">
          <div className="section-title-row"><h2>错误类型</h2><span className="v4-message">累计</span></div>
          {summary?.errors.length ? summary.errors.map((item) => (
            <div className="monitor-row" key={item.error_code}><span>{item.error_code}</span><strong>{item.count}</strong></div>
          )) : <div className="empty-monitor">暂无错误数据</div>}
        </div>
      </section>

      <section className="monitor-columns">
        <div className="monitor-panel">
          <div className="section-title-row"><h2>最近任务</h2><span className="v4-message">Top 8</span></div>
          {summary?.recentTasks.slice(0, 8).map((task) => (
            <div className="monitor-row" key={task.task_id}>
              <span>{task.task_id.slice(0, 12)} · {statusLabel(task.status)}</span>
              <strong>{task.processed_rows}/{task.total_rows}</strong>
            </div>
          ))}
        </div>
        <div className="monitor-panel">
          <div className="section-title-row"><h2>最近错误</h2><span className="v4-message">Top 8</span></div>
          {summary?.recentErrors.slice(0, 8).map((item) => (
            <div className="monitor-row" key={`${item.task_id}-${item.batch_index}-${item.row_number}`}>
              <span>{item.error_code} · 第 {item.row_number} 行</span>
              <strong>{item.task_id.slice(0, 12)}</strong>
            </div>
          )) ?? <div className="empty-monitor">暂无错误</div>}
        </div>
      </section>

      <section className="monitor-panel">
        <div className="section-title-row"><h2>运行说明</h2><code>POST /api/import-worker?limit=5</code></div>
        <p className="monitor-note">本地环境可通过该接口手动拉取 Outbox 任务；生产环境建议由 Cron 或独立 Worker 定时调用，并配置 V4_WORKER_TOKEN。</p>
      </section>
    </div>
  );
}

function buildThroughput(batches: Summary["recentBatches"]): Bucket[] {
  const buckets = new Map<string, number>();
  for (const item of batches) {
    const time = new Date(item.created_at);
    const label = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    buckets.set(label, (buckets.get(label) || 0) + item.success_rows);
  }
  return Array.from(buckets.entries()).slice(-5).map(([label, value]) => ({ label, value }));
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index];
}

function metricLine(metric?: { p50: number; p95: number; p99: number }) {
  return metric ? `${metric.p50} / ${metric.p95} / ${metric.p99} ms` : "-";
}

function buildStageStats(summary: Summary | null) {
  const batches = summary?.recentBatches ?? [];
  const insert = batches.map((item) => item.failed_rows + item.success_rows).filter((value) => value > 0);
  const metrics = summary?.stage_metrics;
  return [
    { label: "总耗时 P50 / P95 / P99", value: metricLine(metrics?.total_duration_ms) },
    { label: "解析 P50 / P95 / P99", value: metricLine(metrics?.parse_duration_ms) },
    { label: "校验 P50 / P95 / P99", value: metricLine(metrics?.validate_duration_ms) },
    { label: "写入 P50 / P95 / P99", value: metricLine(metrics?.insert_duration_ms) },
    { label: "批次大小中位数", value: insert.length ? `${quantile(insert, 0.5)} 行` : "-" },
    { label: "批次总数", value: `${batches.length} 个` },
  ];
}

function statusLabel(status: string) {
  return { PENDING: "等待处理", PROCESSING: "处理中", COMPLETED: "已完成", PARTIAL_SUCCESS: "部分成功", FAILED: "失败" }[status] || status;
}

function MonitorCard({ label, value, hint, tone = "normal" }: { label: string; value: number | string; hint: string; tone?: string }) {
  return <div className={`monitor-card monitor-${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function MiniBars({ bars, suffix }: { bars: Bucket[]; suffix: string }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  if (!bars.length) return <div className="empty-monitor">暂无吞吐数据</div>;
  return (
    <div className="mini-bars">
      {bars.map((bar) => (
        <div key={bar.label} className="mini-bar-item">
          <div className="mini-bar-track"><div style={{ height: `${(bar.value / max) * 100}%` }} /></div>
          <span>{bar.label}</span>
          <strong>{bar.value}{suffix}</strong>
        </div>
      ))}
    </div>
  );
}
