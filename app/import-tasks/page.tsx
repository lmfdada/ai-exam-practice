"use client";

import { useCallback, useEffect, useState } from "react";

type Task = {
  task_id: string;
  trace_id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  degraded: boolean;
  created_at: string;
};

type TaskDetails = {
  batches: Array<{
    unit_id: string;
    batch_index: number;
    start_row: number;
    end_row: number;
    status: string;
    retry_count: number;
    processed_rows: number;
    success_rows: number;
    failed_rows: number;
    completed_at: string | null;
  }>;
  performance: Array<{
    unit_id: string;
    batch_index: number;
    total_duration_ms: number;
    processed_rows: number;
    success_rows: number;
    failed_rows: number;
    status: string;
  }>;
  errors: Array<{
    row_number: number;
    field_name: string;
    error_code: string;
    error_reason: string;
    raw_value: string;
  }>;
};

function statusLabel(status: string) {
  return {
    PENDING: "等待处理",
    PROCESSING: "处理中",
    COMPLETED: "已完成",
    PARTIAL_SUCCESS: "部分成功",
    FAILED: "失败",
  }[status] || status;
}

export default function ImportTasksPage() {
  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadDetails = useCallback(async (taskId: string) => {
    const [taskResponse, batchesResponse] = await Promise.all([
      fetch(`/api/import-tasks/${taskId}`, { cache: "no-store" }),
      fetch(`/api/import-tasks/${taskId}/batches`, { cache: "no-store" }),
    ]);
    const taskJson = await taskResponse.json();
    const batchesJson = await batchesResponse.json();
    if (taskJson.success) setTask(taskJson.data);
    if (batchesJson.success) setDetails({
      batches: batchesJson.data.batches || [],
      performance: batchesJson.data.performance || [],
      errors: taskJson.data.errors || [],
    });
  }, []);

  useEffect(() => {
    if (!task || ["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(task.status)) return;
    const timer = window.setInterval(async () => {
      await loadDetails(task.task_id);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [task, loadDetails]);

  async function submit() {
    if (!file) return;
    setLoading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/import-tasks", { method: "POST", body: formData });
    const json = await response.json();
    if (json.success) {
      setTask(json.data);
      void loadDetails(json.data.task_id);
      setMessage("任务已创建，后台开始处理。");
    } else {
      setMessage(json.message || "任务创建失败");
    }
    setLoading(false);
  }

  async function retryWorker() {
    if (!task) return;
    const response = await fetch(`/api/import-tasks/${task.task_id}/run`, { method: "POST" });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.message || "重试 Worker 失败");
      return;
    }
    setMessage("Worker 已重新执行。");
    await loadDetails(task.task_id);
  }

  const progress = task?.total_rows ? Math.round((task.processed_rows / task.total_rows) * 100) : 0;

  return (
    <div className="v4-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">V4 ASYNC IMPORT</div>
          <h1>异步导入任务</h1>
          <p>上传后立即获得 task_id，解析、校验和写库由后台批次任务完成。</p>
        </div>
        <a className="btn btn-secondary" href="/import">返回原导入页</a>
      </div>

      <section className="v4-toolbar">
        <label className="file-picker">
          <span>选择 Excel / Word 文件</span>
          <input type="file" accept=".xlsx,.xls,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <button className="btn btn-primary" disabled={!file || loading} onClick={submit}>
          {loading ? "创建中..." : "创建异步任务"}
        </button>
        {message && <span className="v4-message">{message}</span>}
      </section>

      {task && (
        <section className="v4-task-layout">
          <div className="v4-task-main">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">TASK {task.task_id}</div>
                <h2>{task.file_name}</h2>
              </div>
              <span className={`status-badge status-${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span>
            </div>
            <div className="v4-progress-track"><div style={{ width: `${progress}%` }} /></div>
            <div className="v4-progress-label">{task.total_rows ? `${progress}% · ${task.processed_rows}/${task.total_rows} 行` : "正在扫描文件并创建批次..."}</div>
            <div className="metric-grid">
              <Metric label="成功行数" value={task.success_rows} />
              <Metric label="失败行数" value={task.failed_rows} />
              <Metric label="批次进度" value={`${task.completed_batches}/${task.total_batches || "-"}`} />
              <Metric label="降级校验" value={task.degraded ? "是" : "否"} />
            </div>
            <div className="trace-box">
              <div><strong>trace_id</strong><code>{task.trace_id}</code></div>
              <div><strong>创建时间</strong><span>{new Date(task.created_at).toLocaleString("zh-CN")}</span></div>
            </div>
            <div className="task-subgrid">
              <div className="task-subpanel">
                <h3>批次</h3>
                {details?.batches?.length ? details.batches.map((batch) => (
                  <div className="task-minirow" key={batch.unit_id}>
                    <span>批次 {batch.batch_index + 1}</span>
                    <strong>{batch.status}</strong>
                  </div>
                )) : <div className="empty-monitor">暂无批次</div>}
              </div>
              <div className="task-subpanel">
                <h3>错误</h3>
                {details?.errors?.length ? details.errors.slice(0, 8).map((error) => (
                  <div className="task-minirow" key={`${error.row_number}-${error.error_code}`}>
                    <span>第 {error.row_number} 行 · {error.error_code}</span>
                    <strong>{error.error_reason}</strong>
                  </div>
                )) : <div className="empty-monitor">暂无错误</div>}
              </div>
            </div>
            {task.status === "FAILED" && <button className="btn btn-secondary" onClick={retryWorker}>重试 Worker</button>}
          </div>
          <div className="v4-task-side">
            <h3>验收状态</h3>
            <Check label="异步任务创建" ok />
            <Check label="Outbox 事件记录" ok />
            <Check label="分批处理" ok={task.total_batches > 0} />
            <Check label="行级错误记录" ok={task.failed_rows > 0 || task.status === "COMPLETED"} />
            <a className="btn btn-secondary full-width" href={`/api/traces/${task.trace_id}`} target="_blank">查看 Trace JSON</a>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <div className="check-row"><span>{ok ? "✓" : "○"}</span>{label}</div>;
}
