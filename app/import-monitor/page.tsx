"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
  tasks: Array<{ status: string; count: number }>;
  queue_depth: number;
  errors: Array<{ error_code: string; count: number }>;
  performance: { avg_duration_ms?: number; max_duration_ms?: number };
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
  const stageStats = useMemo(() => buildStageStats(summary?.recentBatches ?? []), [summary]);

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
        <MonitorCard label="平均批次耗时" value={summary?.performance.avg_duration_ms ? `${summary.performance.avg_duration_ms} ms` : "-"} hint={`最大 ${summary?.performance.max_duration_ms ?? "-"} ms`} />
      </section>

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

function buildStageStats(batches: Summary["recentBatches"]) {
  const durations = batches.map((item) => item.total_duration_ms).filter((value) => value > 0);
  const validate = batches.map((item) => item.total_duration_ms / Math.max(item.processed_rows || 1, 1)).filter((value) => value > 0);
  const insert = batches.map((item) => item.failed_rows + item.success_rows).filter((value) => value > 0);
  return [
    { label: "总耗时 P50 / P95", value: durations.length ? `${quantile(durations, 0.5)} / ${quantile(durations, 0.95)} ms` : "-" },
    { label: "单行耗时 P50 / P95", value: validate.length ? `${quantile(validate, 0.5).toFixed(1)} / ${quantile(validate, 0.95).toFixed(1)} ms` : "-" },
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
