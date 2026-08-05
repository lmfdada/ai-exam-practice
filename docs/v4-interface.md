# V4 接口说明

## 创建任务

`POST /api/import-tasks`

使用 `multipart/form-data`，字段：

- `file`
- `rule`：可选，已确认的解析规则 JSON

返回 `202`：

```json
{
  "success": true,
  "data": {
    "task_id": "task_xxx",
    "trace_id": "trace_xxx",
    "status": "PENDING"
  }
}
```

## 查询任务

`GET /api/import-tasks/:taskId`

返回任务统计和最多 50 条错误明细。

## 查询错误明细

`GET /api/import-tasks/:taskId/errors?batch=4&error_code=E001&page=1&page_size=50`

返回行级错误分页结果：

```json
{
  "success": true,
  "data": {
    "rows": [],
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 1
  }
}
```

`batch` 使用从 0 开始的批次编号；页面展示时会显示为“批次 1/2/3...”。

## 导出失败明细

`GET /api/import-tasks/:taskId/errors/export?batch=4&error_code=E001`

按当前筛选条件导出 CSV，包含 `task_id`、`batch_index`、`row_number`、`field_name`、`raw_value`、`error_code`、`error_reason`、`trace_id` 和 `created_at`。

## 查询批次

`GET /api/import-tasks/:taskId/batches`

返回批次状态和批次性能日志。

## 手动重试

`POST /api/import-tasks/:taskId/run`

失败任务会重新放回 Outbox，随后执行一个 Worker 消费循环。
生产环境需要携带 `V4_ADMIN_TOKEN`：

```text
x-admin-token: ${V4_ADMIN_TOKEN}
```

## Dispatcher

`POST /api/import-worker?limit=5`

如果配置 `V4_WORKER_TOKEN`，请求必须带：

```text
x-worker-token: ${V4_WORKER_TOKEN}
```

生产环境未配置 Worker 令牌时，Dispatcher 请求默认拒绝；本地开发环境可省略令牌。

## SKU 主数据

`POST /api/import-monitor/seed`

用于压测前批量写入 SKU 主数据，单次最多 50000 条。生产环境需要携带：

```text
x-admin-token: ${V4_ADMIN_TOKEN}
```

本地开发环境可省略令牌。

## Trace

`GET /api/traces/:traceId`

返回任务创建、批次完成、任务完成或失败等时间线事件。

`GET /api/traces?trace_id=trace_xxx&task_id=task_xxx&filename=orders.xlsx&batch=4&row_from=10&row_to=20&error_code=E001`

按 trace、任务、文件名、批次、行号范围和错误码组合搜索 Trace 事件。

## 监控

`GET /api/import-monitor/summary`

返回队列积压、任务状态、错误分布、最近任务、最近批次和最近错误。
