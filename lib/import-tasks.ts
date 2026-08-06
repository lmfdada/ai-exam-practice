import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildOrderRow, validateRow } from "@/lib/orders";
import { getDb } from "@/lib/db";
import { parseImportFile } from "@/lib/import-parser";

export type ImportTaskStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
export type ImportTask = {
  task_id: string;
  trace_id: string;
  file_name: string;
  status: ImportTaskStatus;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  degraded: boolean;
  created_at: string;
  completed_at: string | null;
};

const BATCH_SIZE = 500;
const SKU_VALIDATE_TIMEOUT_MS = 3000;
let schemaPromise: Promise<void> | null = null;

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function now() {
  return new Date().toISOString();
}

async function ensureSchema() {
  if (process.env.V4_ASSUME_SCHEMA_READY === "1") return;
  if (schemaPromise) return schemaPromise;
  const sql = getDb();
  schemaPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS import_tasks (
        task_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL,
        rule_json TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING', total_rows INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0, success_rows INTEGER NOT NULL DEFAULT 0, failed_rows INTEGER NOT NULL DEFAULT 0,
        total_batches INTEGER NOT NULL DEFAULT 0, completed_batches INTEGER NOT NULL DEFAULT 0, degraded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS import_task_batches (
        unit_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, batch_index INTEGER NOT NULL, start_row INTEGER NOT NULL,
        end_row INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', retry_count INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0, success_rows INTEGER NOT NULL DEFAULT 0, failed_rows INTEGER NOT NULL DEFAULT 0,
        locked_at TEXT, completed_at TEXT, UNIQUE(task_id, batch_index)
      )`,
      `CREATE TABLE IF NOT EXISTS import_task_errors (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, unit_id TEXT NOT NULL, batch_index INTEGER NOT NULL, row_number INTEGER NOT NULL,
        field_name TEXT NOT NULL, raw_value TEXT NOT NULL, error_code TEXT NOT NULL, error_reason TEXT NOT NULL, trace_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS event_outbox (
        event_id TEXT PRIMARY KEY, aggregate_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING', retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT NOT NULL,
        created_at TEXT NOT NULL, locked_at TEXT, sent_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS batch_performance_log (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, unit_id TEXT NOT NULL, batch_index INTEGER NOT NULL,
        parse_duration_ms INTEGER NOT NULL DEFAULT 0, rule_duration_ms INTEGER NOT NULL DEFAULT 0,
        validate_duration_ms INTEGER NOT NULL DEFAULT 0, insert_duration_ms INTEGER NOT NULL DEFAULT 0,
        total_duration_ms INTEGER NOT NULL DEFAULT 0, processed_rows INTEGER NOT NULL DEFAULT 0,
        success_rows INTEGER NOT NULL DEFAULT 0, failed_rows INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL, trace_id TEXT NOT NULL, created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS trace_events (
        id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, task_id TEXT NOT NULL, unit_id TEXT,
        event_name TEXT NOT NULL, event_status TEXT NOT NULL, message TEXT NOT NULL, occurred_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sku_master (
        sku_code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_import_tasks_status_created ON import_tasks(status, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_import_batches_task_status ON import_task_batches(task_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_import_errors_task_unit ON import_task_errors(task_id, unit_id)`,
      `CREATE INDEX IF NOT EXISTS idx_import_errors_code ON import_task_errors(error_code)`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON event_outbox(status, next_retry_at)`,
      `CREATE INDEX IF NOT EXISTS idx_trace_events_trace_time ON trace_events(trace_id, occurred_at)`,
    ];
    for (const statement of statements) await sql.query(statement);
    for (const statement of [
      `ALTER TABLE orders ADD COLUMN idempotency_key TEXT`,
      `ALTER TABLE orders ADD COLUMN source_line_no INTEGER`,
    ]) {
      try { await sql.query(statement); } catch {}
    }
    try {
      await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    } catch {}
    for (const statement of [
      `ALTER TABLE batch_performance_log ADD COLUMN processed_rows INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE batch_performance_log ADD COLUMN success_rows INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE batch_performance_log ADD COLUMN failed_rows INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE event_outbox ADD COLUMN locked_at TEXT`,
    ]) {
      try { await sql.query(statement); } catch {}
    }
  })();
  return schemaPromise;
}

async function trace(sql: ReturnType<typeof getDb>, traceId: string, taskId: string, eventName: string, status: string, message: string, unitId?: string) {
  await sql.query(
    `INSERT INTO trace_events (id, trace_id, task_id, unit_id, event_name, event_status, message, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id("trace"), traceId, taskId, unitId ?? null, eventName, status, message, now()],
  );
}

function maskSensitiveValue(value: string) {
  return value
    .replace(/1\d{10}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
    .replace(/("receiver_phone"\s*:\s*")([^"]+)(")/g, (_match, start, phone, end) => `${start}${String(phone).replace(/1\d{10}/g, (p) => `${p.slice(0, 3)}****${p.slice(-4)}`)}${end}`)
    .replace(/("receiver_address"\s*:\s*")([^"]+)(")/g, (_match, start, address, end) => `${start}${String(address).slice(0, 6)}***${end}`);
}

async function querySkuMaster(sql: ReturnType<typeof getDb>, skuCodes: string[]) {
  if (process.env.V4_FORCE_SKU_DEGRADED === "1") throw new Error("V4_FORCE_SKU_DEGRADED enabled");
  const placeholders = skuCodes.map((_, index) => `$${index + 1}`).join(",");
  const query = sql.query(`SELECT sku_code FROM sku_master WHERE sku_code IN (${placeholders})`, skuCodes);
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`SKU 主数据查询超过 ${SKU_VALIDATE_TIMEOUT_MS}ms`)), SKU_VALIDATE_TIMEOUT_MS);
  });
  return Promise.race([query, timeout]) as Promise<Record<string, unknown>[]>;
}

export async function createImportTask(file: File, ruleJson?: string | null) {
  await ensureSchema();
  const taskId = id("task");
  const traceId = id("trace");
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf(".")) || ".bin";
  const importDir = path.join(process.env.VERCEL === "1" ? "/tmp" : process.cwd(), "data", "imports");
  const filePath = path.join(importDir, `${taskId}${extension}`);
  const createdAt = now();
  const task: ImportTask = {
    task_id: taskId,
    trace_id: traceId,
    file_name: file.name,
    status: "PENDING",
    total_rows: 0,
    processed_rows: 0,
    success_rows: 0,
    failed_rows: 0,
    total_batches: 0,
    completed_batches: 0,
    degraded: false,
    created_at: createdAt,
    completed_at: null,
  };
  const sql = getDb();
  if (sql.transactionQueries) {
    await sql.transactionQueries([
      {
        sql: `INSERT INTO import_tasks (task_id, trace_id, file_name, file_path, rule_json, status, created_at)
          VALUES ($1,$2,$3,$4,$5,'PENDING',$6)`,
        values: [taskId, traceId, file.name, filePath, ruleJson ?? "", createdAt],
      },
    ]);
    return task;
  }
  const writeTask = async (tx: ReturnType<typeof getDb>) => {
    await tx.query(
      `INSERT INTO import_tasks (task_id, trace_id, file_name, file_path, rule_json, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6)`,
      [taskId, traceId, file.name, filePath, ruleJson ?? "", createdAt],
    );
  };
  if (sql.transaction) await sql.transaction(writeTask);
  else await writeTask(sql);
  return task;
}

export async function finalizeImportTaskUpload(task: ImportTask, file: File, ruleJson?: string | null) {
  const sql = getDb();
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf(".")) || ".bin";
  const importDir = path.join(process.env.VERCEL === "1" ? "/tmp" : process.cwd(), "data", "imports");
  await fs.mkdir(importDir, { recursive: true });
  const filePath = path.join(importDir, `${task.task_id}${extension}`);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, fileBuffer);
  await sql.query(`UPDATE import_tasks SET file_path=$1, rule_json=$2 WHERE task_id=$3`, [filePath, ruleJson ?? "", task.task_id]);
  await sql.query(
    `INSERT INTO event_outbox (event_id, aggregate_id, event_type, payload, status, retry_count, next_retry_at, created_at)
     VALUES ($1,$2,'ImportTaskCreated',$3,'PENDING',0,$4,$4)`,
    [id("evt"), task.task_id, JSON.stringify({ schema_version: 1, task_id: task.task_id, trace_id: task.trace_id }), now()],
  );
}

export async function getImportTask(taskId: string): Promise<ImportTask | null> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql.query(`SELECT * FROM import_tasks WHERE task_id = $1`, [taskId]) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  return {
    task_id: String(row.task_id), trace_id: String(row.trace_id), file_name: String(row.file_name),
    status: String(row.status) as ImportTaskStatus, total_rows: Number(row.total_rows), processed_rows: Number(row.processed_rows),
    success_rows: Number(row.success_rows), failed_rows: Number(row.failed_rows), total_batches: Number(row.total_batches),
    completed_batches: Number(row.completed_batches), degraded: Boolean(Number(row.degraded)),
    created_at: String(row.created_at), completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

async function claimOutbox() {
  const sql = getDb();
  const rows = await sql.query(
    `UPDATE event_outbox SET status='PROCESSING', retry_count=retry_count+1, locked_at=$1
     WHERE event_id = (
       SELECT event_id FROM event_outbox
       WHERE status='PENDING' AND next_retry_at <= $1 AND retry_count < 5
       ORDER BY created_at LIMIT 1
     )
     RETURNING event_id, aggregate_id, payload, retry_count`,
    [now()],
  ) as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function recoverStaleWork() {
  const sql = getDb();
  const recoveryTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const retryTime = now();
  await sql.query(
    `UPDATE event_outbox SET status='PENDING', locked_at=NULL, next_retry_at=$1
     WHERE status='PROCESSING' AND locked_at IS NOT NULL AND locked_at < $2`,
    [retryTime, recoveryTime],
  );
  await sql.query(
    `UPDATE event_outbox SET status='PENDING', locked_at=NULL
     WHERE status='FAILED' AND next_retry_at <= $1 AND retry_count < 5`,
    [retryTime],
  );
  await sql.query(
    `UPDATE import_tasks SET status='PENDING', completed_at=NULL
     WHERE task_id IN (
       SELECT aggregate_id FROM event_outbox
       WHERE status='PENDING' AND retry_count > 0 AND retry_count < 5
     ) AND status='FAILED'`,
    [],
  );
}

async function reconcileTaskProgress(sql: ReturnType<typeof getDb>, taskId: string) {
  const rows = await sql.query(
    `SELECT
       COALESCE(SUM(processed_rows), 0) AS processed_rows,
       COALESCE(SUM(success_rows), 0) AS success_rows,
       COALESCE(SUM(failed_rows), 0) AS failed_rows,
       COALESCE(SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_batches
     FROM import_task_batches WHERE task_id=$1`,
    [taskId],
  ) as Record<string, unknown>[];
  const progress = rows[0] ?? {};
  const processedRows = Number(progress.processed_rows ?? 0);
  const successRows = Number(progress.success_rows ?? 0);
  const failedRows = Number(progress.failed_rows ?? 0);
  const completedBatches = Number(progress.completed_batches ?? 0);
  await sql.query(
    `UPDATE import_tasks SET processed_rows=$1, success_rows=$2, failed_rows=$3, completed_batches=$4
     WHERE task_id=$5`,
    [processedRows, successRows, failedRows, completedBatches, taskId],
  );
  return { processedRows, successRows, failedRows, completedBatches };
}

async function cleanupImportFile(sql: ReturnType<typeof getDb>, taskId: string) {
  const rows = await sql.query(`SELECT file_path FROM import_tasks WHERE task_id=$1`, [taskId]) as Record<string, unknown>[];
  const filePath = rows[0]?.file_path;
  if (filePath) await fs.unlink(String(filePath)).catch(() => undefined);
}

async function insertMany(sql: ReturnType<typeof getDb>, query: string, rows: unknown[][], suffix = "") {
  if (!rows.length) return;
  const values: unknown[] = [];
  const groups = rows.map((row, rowIndex) => {
    const placeholders = row.map((_, columnIndex) => `$${rowIndex * row.length + columnIndex + 1}`);
    values.push(...row);
    return `(${placeholders.join(",")})`;
  });
  await sql.query(`${query} VALUES ${groups.join(",")} ${suffix}`, values);
}

async function processBatch(task: ImportTask, batch: Record<string, unknown>, rows: Record<string, string>[], rowNumbers: number[]) {
  const sql = getDb();
  const unitId = String(batch.unit_id);
  const batchIndex = Number(batch.batch_index);
  const started = Date.now();
  const existingCodes = new Set<string>();
  const skuCodes = rows.map((row) => row.sku_code).filter(Boolean);
  let degraded = false;
  const parseStarted = started;
  if (skuCodes.length) {
    try {
      const skuRows = await querySkuMaster(sql, skuCodes);
      skuRows.forEach((row) => existingCodes.add(String(row.sku_code)));
    } catch (error) {
      degraded = true;
      await sql.query(`UPDATE import_tasks SET degraded=1 WHERE task_id=$1`, [task.task_id]);
      await trace(sql, task.trace_id, task.task_id, "ImportTaskDegraded", "warning", error instanceof Error ? error.message : "SKU 校验降级", unitId);
    }
  }
  const errors: unknown[][] = [];
  const successful: Record<string, string | number>[] = [];
  const validateStarted = Date.now();
  rows.forEach((raw, index) => {
    const row = buildOrderRow(raw);
    const rowErrors = validateRow(raw, index, rows, new Set<string>());
    if (!degraded && skuCodes.length && existingCodes.size && !existingCodes.has(row.sku_code)) {
      rowErrors.push(`第 ${rowNumbers[index]} 行，SKU 不存在于主数据`);
    }
    if (rowErrors.length) {
      rowErrors.forEach((reason) => errors.push([
        id("err"), task.task_id, unitId, batchIndex, rowNumbers[index] ?? index + 1, "row", maskSensitiveValue(JSON.stringify(raw)),
        reason.includes("SKU") ? "E001" : "E002", reason, task.trace_id, now(),
      ]));
    } else {
      successful.push({ ...row, source_line_no: rowNumbers[index] ?? index + 1 });
    }
  });
  await insertMany(sql,
    `INSERT INTO import_task_errors
      (id, task_id, unit_id, batch_index, row_number, field_name, raw_value, error_code, error_reason, trace_id, created_at)`,
    errors);
  const insertStarted = Date.now();
  const orderRows = successful.map((row) => {
    const key = `${task.task_id}:${row.source_line_no}`;
    return [
      row.external_code, row.receiver_store, row.receiver_name, row.receiver_phone, row.receiver_address,
      row.sku_code, row.sku_name, row.sku_qty, row.sku_spec, row.temperature_layer, row.remark,
      `${task.task_id}`, row.source_line_no, key,
    ];
  });
  await insertMany(sql,
    `INSERT INTO orders
      (external_code, receiver_store, receiver_name, receiver_phone, receiver_address, sku_code, sku_name, sku_qty,
       sku_spec, temperature_layer, remark, batch_id, source_line_no, idempotency_key)`,
    orderRows.map((row) => row),
    "ON CONFLICT DO NOTHING");
  await sql.query(
    `UPDATE import_task_batches SET status='COMPLETED', processed_rows=$1, success_rows=$2, failed_rows=$3, completed_at=$4
     WHERE unit_id=$5 AND status <> 'COMPLETED'`,
    [rows.length, successful.length, errors.length, now(), unitId],
  );
  await sql.query(
    `UPDATE import_tasks SET processed_rows=processed_rows+$1, success_rows=success_rows+$2, failed_rows=failed_rows+$3,
     completed_batches=completed_batches+1 WHERE task_id=$4`,
    [rows.length, successful.length, errors.length, task.task_id],
  );
  await sql.query(
    `INSERT INTO batch_performance_log
      (id, task_id, unit_id, batch_index, parse_duration_ms, rule_duration_ms, validate_duration_ms, insert_duration_ms,
       total_duration_ms, processed_rows, success_rows, failed_rows, status, trace_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id("perf"), task.task_id, unitId, batchIndex, Date.now() - parseStarted, 0, validateStarted - started, Date.now() - insertStarted,
      Date.now() - started, rows.length, successful.length, errors.length, degraded ? "DEGRADED" : errors.length ? "PARTIAL_SUCCESS" : "COMPLETED", task.trace_id, now()],
  );
  await trace(sql, task.trace_id, task.task_id, "ImportBatchCompleted", degraded ? "warning" : "success", `成功 ${successful.length} 行，失败 ${errors.length} 行${degraded ? "，SKU 校验降级" : ""}`, unitId);
}

export async function runImportWorker(limit = 1) {
  await ensureSchema();
  await recoverStaleWork();
  let processed = 0;
  while (processed < limit) {
    const event = await claimOutbox();
    if (!event) break;
    const taskId = String(event.aggregate_id);
    const task = await getImportTask(taskId);
    const sql = getDb();
    if (!task) {
      await sql.query(
        `UPDATE event_outbox SET status='FAILED', retry_count=5, locked_at=NULL, next_retry_at=$1 WHERE event_id=$2`,
        [now(), event.event_id],
      );
      processed++;
      continue;
    }
    try {
      await trace(sql, task.trace_id, taskId, "ImportTaskCreated", "success", "Worker 已消费任务创建事件");
      const taskRows = await sql.query(`SELECT file_path, rule_json FROM import_tasks WHERE task_id=$1`, [taskId]) as Record<string, unknown>[];
      const taskRow = taskRows[0];
      if (!taskRow) throw new Error("任务文件记录不存在");
      const fileBuffer = await fs.readFile(String(taskRow.file_path));
      const parsed = await parseImportFile(
        fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
        task.file_name,
        String(taskRow.rule_json || ""),
      );
      const totalBatches = Math.ceil(parsed.rows.length / BATCH_SIZE);
      await sql.query(`UPDATE import_tasks SET status='PROCESSING', total_rows=$1, total_batches=$2 WHERE task_id=$3`, [parsed.rows.length, totalBatches, taskId]);
      const currentTask = await getImportTask(taskId);
      if (!currentTask) throw new Error("任务不存在");
      const pendingBatches: Array<{
        batch: Record<string, unknown>;
        rows: Record<string, string>[];
        rowNumbers: number[];
      }> = [];
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const unitId = `${taskId}_unit_${batchIndex + 1}`;
        await sql.query(
          `INSERT INTO import_task_batches (unit_id, task_id, batch_index, start_row, end_row)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT(task_id,batch_index) DO NOTHING`,
          [unitId, taskId, batchIndex, batchIndex * BATCH_SIZE + 1, Math.min(parsed.rows.length, (batchIndex + 1) * BATCH_SIZE)],
        );
        const batchRows = await sql.query(`SELECT * FROM import_task_batches WHERE task_id=$1 AND batch_index=$2`, [taskId, batchIndex]) as Record<string, unknown>[];
        if (batchRows[0]?.status !== "COMPLETED") {
          pendingBatches.push({
            batch: batchRows[0],
            rows: parsed.rows.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE),
            rowNumbers: parsed.rowNumbers.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE),
          });
        }
      }
      const concurrency = Math.max(1, Math.min(8, Number(process.env.V4_WORKER_CONCURRENCY || 2)));
      for (let offset = 0; offset < pendingBatches.length; offset += concurrency) {
        const group = pendingBatches.slice(offset, offset + concurrency);
        await Promise.all(group.map((item) => processBatch(currentTask, item.batch, item.rows, item.rowNumbers)));
      }
      const progress = await reconcileTaskProgress(sql, taskId);
      const finalStatus = progress.failedRows > 0 ? "PARTIAL_SUCCESS" : "COMPLETED";
      await sql.query(`UPDATE import_tasks SET status=$1, completed_at=$2 WHERE task_id=$3`, [finalStatus, now(), taskId]);
      await sql.query(`UPDATE event_outbox SET status='SENT', locked_at=NULL, sent_at=$1 WHERE event_id=$2`, [now(), event.event_id]);
      await trace(sql, task.trace_id, taskId, "ImportTaskCompleted", "success", `任务完成，状态 ${finalStatus}`);
      await cleanupImportFile(sql, taskId);
    } catch (error) {
      console.error("[v4] worker event failed", taskId, error);
      await sql.query(`UPDATE import_tasks SET status='FAILED', completed_at=$1 WHERE task_id=$2`, [now(), taskId]);
      const retryCount = Number(event.retry_count || 1);
      const backoffMs = Math.min(15 * 60 * 1000, 30_000 * 2 ** Math.max(0, retryCount - 1));
      await sql.query(
        `UPDATE event_outbox SET status='FAILED', locked_at=NULL, next_retry_at=$1 WHERE event_id=$2`,
        [new Date(Date.now() + backoffMs).toISOString(), event.event_id],
      );
      await trace(sql, task.trace_id, taskId, "ImportTaskFailed", "failed", error instanceof Error ? error.message : String(error));
      if (retryCount >= 5) await cleanupImportFile(sql, taskId);
    }
    processed++;
  }
  return { processed };
}

export type TaskErrorQueryOptions = {
  page?: number;
  pageSize?: number;
  batch?: number;
  errorCode?: string;
};

export async function getTaskErrorsPage(taskId: string, options: TaskErrorQueryOptions = {}) {
  await ensureSchema();
  const sql = getDb();
  const page = Math.max(1, Math.floor(Number(options.page || 1)));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize || 50))));
  const values: unknown[] = [taskId];
  const where = ["task_id=$1"];

  if (typeof options.batch === "number" && Number.isFinite(options.batch)) {
    values.push(options.batch);
    where.push(`batch_index=$${values.length}`);
  }
  if (options.errorCode) {
    values.push(options.errorCode);
    where.push(`error_code=$${values.length}`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await sql.query(`SELECT COUNT(*)::int AS count FROM import_task_errors WHERE ${whereSql}`, values) as Record<string, unknown>[];
  const total = Number(countRows[0]?.count ?? 0);
  const offset = (page - 1) * pageSize;
  const rows = await sql.query(
    `SELECT * FROM import_task_errors WHERE ${whereSql} ORDER BY row_number, batch_index LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset],
  );
  return { rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getTaskErrors(taskId: string, page = 1, pageSize = 50) {
  return (await getTaskErrorsPage(taskId, { page, pageSize })).rows;
}

export async function getTaskTrace(traceId: string) {
  await ensureSchema();
  const sql = getDb();
  return sql.query(`SELECT * FROM trace_events WHERE trace_id=$1 ORDER BY occurred_at`, [traceId]);
}

export type TraceSearchOptions = {
  traceId?: string;
  taskId?: string;
  fileName?: string;
  batch?: number;
  rowFrom?: number;
  rowTo?: number;
  errorCode?: string;
  limit?: number;
};

export async function searchTraceEvents(options: TraceSearchOptions) {
  await ensureSchema();
  const sql = getDb();
  const values: unknown[] = [];
  const where: string[] = [];

  if (options.traceId) {
    values.push(options.traceId);
    where.push(`te.trace_id=$${values.length}`);
  }
  if (options.taskId) {
    values.push(options.taskId);
    where.push(`te.task_id=$${values.length}`);
  }
  if (options.fileName) {
    values.push(`%${options.fileName}%`);
    where.push(`it.file_name ILIKE $${values.length}`);
  }
  if (typeof options.batch === "number" && Number.isFinite(options.batch)) {
    values.push(options.batch);
    where.push(`EXISTS (SELECT 1 FROM import_task_batches b WHERE b.task_id=te.task_id AND b.unit_id=te.unit_id AND b.batch_index=$${values.length})`);
  }
  if (typeof options.rowFrom === "number" && Number.isFinite(options.rowFrom)) {
    values.push(options.rowFrom);
    where.push(`EXISTS (SELECT 1 FROM import_task_errors e WHERE e.task_id=te.task_id AND e.trace_id=te.trace_id AND e.row_number >= $${values.length})`);
  }
  if (typeof options.rowTo === "number" && Number.isFinite(options.rowTo)) {
    values.push(options.rowTo);
    where.push(`EXISTS (SELECT 1 FROM import_task_errors e WHERE e.task_id=te.task_id AND e.trace_id=te.trace_id AND e.row_number <= $${values.length})`);
  }
  if (options.errorCode) {
    values.push(options.errorCode);
    where.push(`EXISTS (SELECT 1 FROM import_task_errors e WHERE e.task_id=te.task_id AND e.trace_id=te.trace_id AND e.error_code=$${values.length})`);
  }

  const limit = Math.min(500, Math.max(1, Math.floor(Number(options.limit || 100))));
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return sql.query(
    `SELECT te.*, it.file_name
     FROM trace_events te
     LEFT JOIN import_tasks it ON it.task_id=te.task_id
     ${whereSql}
     ORDER BY te.occurred_at DESC
     LIMIT $${values.length + 1}`,
    [...values, limit],
  );
}

export async function getTaskBatches(taskId: string) {
  await ensureSchema();
  const sql = getDb();
  return sql.query(`SELECT * FROM import_task_batches WHERE task_id=$1 ORDER BY batch_index`, [taskId]);
}

export async function getTaskPerformance(taskId: string) {
  await ensureSchema();
  const sql = getDb();
  return sql.query(`SELECT * FROM batch_performance_log WHERE task_id=$1 ORDER BY batch_index`, [taskId]);
}

export async function retryImportTask(taskId: string) {
  await ensureSchema();
  const sql = getDb();
  await sql.query(
    `UPDATE import_tasks SET status='PENDING', completed_at=NULL WHERE task_id=$1 AND status='FAILED'`,
    [taskId],
  );
  await sql.query(
    `UPDATE event_outbox SET status='PENDING', retry_count=0, locked_at=NULL, sent_at=NULL, next_retry_at=$1
     WHERE aggregate_id=$2 AND status='FAILED'`,
    [now(), taskId],
  );
  return getImportTask(taskId);
}

export async function getMonitorSummary() {
  await ensureSchema();
  const sql = getDb();
  const [tasks, batches, errors, performance, recentTasks, recentBatches, recentErrors] = await Promise.all([
    sql.query(`SELECT status, COUNT(*)::int AS count FROM import_tasks GROUP BY status`),
    sql.query(`SELECT COUNT(*)::int AS count FROM event_outbox WHERE status IN ('PENDING','PROCESSING')`),
    sql.query(`SELECT error_code, COUNT(*)::int AS count FROM import_task_errors GROUP BY error_code ORDER BY count DESC`),
    sql.query(`SELECT AVG(total_duration_ms)::int AS avg_duration_ms, MAX(total_duration_ms)::int AS max_duration_ms FROM batch_performance_log`),
    sql.query(`SELECT task_id, status, total_rows, processed_rows, success_rows, failed_rows, total_batches, completed_batches, created_at, completed_at FROM import_tasks ORDER BY created_at DESC LIMIT 40`),
    sql.query(`SELECT task_id, batch_index, status, total_duration_ms, processed_rows, success_rows, failed_rows, trace_id, created_at FROM batch_performance_log ORDER BY created_at DESC LIMIT 40`),
    sql.query(`SELECT task_id, batch_index, row_number, error_code, error_reason, trace_id, created_at FROM import_task_errors ORDER BY created_at DESC LIMIT 40`),
  ]);
  return {
    tasks,
    queue_depth: Number((batches[0] as Record<string, unknown>)?.count ?? 0),
    errors,
    performance: performance[0] ?? {},
    recentTasks,
    recentBatches,
    recentErrors,
  };
}
