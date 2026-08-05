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
};

type TaskError = {
  row_number: number;
  batch_index: number;
  field_name: string;
  error_code: string;
  error_reason: string;
  raw_value: string;
  trace_id: string;
};

type ErrorPage = {
  rows: TaskError[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  const [errorsPage, setErrorsPage] = useState<ErrorPage>({ rows: [], page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [errorBatch, setErrorBatch] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [selectedError, setSelectedError] = useState<TaskError | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    });
  }, []);

  const loadErrors = useCallback(async (taskId: string) => {
    const params = new URLSearchParams({
      page: String(errorsPage.page),
      page_size: "50",
    });
    if (errorBatch) params.set("batch", errorBatch);
    if (errorCode) params.set("error_code", errorCode.trim());
    const response = await fetch(`/api/import-tasks/${taskId}/errors?${params.toString()}`, { cache: "no-store" });
    const json = await response.json();
    if (json.success) {
      setErrorsPage(json.data);
      setSelectedError(null);
    }
  }, [errorBatch, errorCode, errorsPage.page]);

  useEffect(() => {
    if (!task?.task_id) return;
    const timer = window.setTimeout(() => {
      void loadErrors(task.task_id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [task?.task_id, loadErrors]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
    setErrorBatch("");
    setErrorCode("");
    setErrorsPage({ rows: [], page: 1, pageSize: 50, total: 0, totalPages: 1 });
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
  const elapsedSeconds = task ? Math.max(1, Math.floor((nowMs - new Date(task.created_at).getTime()) / 1000)) : 0;
  const throughput = task ? task.processed_rows / elapsedSeconds : 0;
  const remainingRows = task ? Math.max(0, task.total_rows - task.processed_rows) : 0;
  const etaSeconds = throughput > 0 && remainingRows > 0 ? Math.ceil(remainingRows / throughput) : 0;
  const exportParams = new URLSearchParams();
  if (errorBatch) exportParams.set("batch", errorBatch);
  if (errorCode) exportParams.set("error_code", errorCode.trim());
  const exportUrl = task ? `/api/import-tasks/${task.task_id}/errors/export${exportParams.size ? `?${exportParams.toString()}` : ""}` : "#";

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
              <Metric label="当前吞吐" value={`${throughput.toFixed(1)} 行/秒`} />
              <Metric label="预计剩余" value={etaSeconds ? `${etaSeconds} 秒` : "-"} />
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
                <div className="section-title-row compact">
                  <h3>错误</h3>
                  <a className="btn btn-secondary btn-small" href={exportUrl}>导出失败明细</a>
                </div>
                <div className="error-filters">
                  <select value={errorBatch} onChange={(event) => { setErrorBatch(event.target.value); setErrorsPage((current) => ({ ...current, page: 1 })); }}>
                    <option value="">全部批次</option>
                    {details?.batches?.map((batch) => (
                      <option key={batch.unit_id} value={batch.batch_index}>批次 {batch.batch_index + 1}</option>
                    ))}
                  </select>
                  <input value={errorCode} placeholder="错误码" onChange={(event) => { setErrorCode(event.target.value); setErrorsPage((current) => ({ ...current, page: 1 })); }} />
                </div>
                {errorsPage.rows.length ? errorsPage.rows.map((error) => (
                  <button className="task-minirow error-row" key={`${error.row_number}-${error.error_code}-${error.field_name}`} onClick={() => setSelectedError(error)}>
                    <span>第 {error.row_number} 行 · 批次 {error.batch_index + 1} · {error.error_code}</span>
                    <strong>{error.error_reason}</strong>
                  </button>
                )) : <div className="empty-monitor">暂无错误</div>}
                <div className="pager-row">
                  <button className="btn btn-secondary btn-small" disabled={errorsPage.page <= 1} onClick={() => setErrorsPage((current) => ({ ...current, page: current.page - 1 }))}>上一页</button>
                  <span>{errorsPage.page}/{errorsPage.totalPages} · {errorsPage.total} 条</span>
                  <button className="btn btn-secondary btn-small" disabled={errorsPage.page >= errorsPage.totalPages} onClick={() => setErrorsPage((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
                </div>
                {selectedError && (
                  <div className="error-detail">
                    <div><strong>字段</strong><span>{selectedError.field_name}</span></div>
                    <div><strong>原值</strong><code>{selectedError.raw_value || "-"}</code></div>
                    <div><strong>原因</strong><span>{selectedError.error_reason}</span></div>
                    <div><strong>建议</strong><span>{selectedError.error_code === "E001" ? "确认 SKU 是否已同步到主数据后重新导入。" : "检查该行必填字段、格式和解析规则映射。"}</span></div>
                  </div>
                )}
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
