# V4 异步导入重构假设说明

## 范围

本阶段只改造 V2 的导入主链路：文件保存、异步任务、规则执行、批量校验、批量写入、错误定位和监控。V3 审批与异常工单不在范围内。

## 处理单元

- 默认每个批次 500 行。
- 默认同一任务最多并发处理 2 个批次，可通过 `V4_WORKER_CONCURRENCY` 调整，硬上限为 8。
- 一个 `import_task` 对应多个 `import_task_batches`。
- 批次完成后才累计任务进度，避免重复消费造成重复累计。
- 稳定幂等键为 `task_id + source_line_no`，写入订单时使用 `ON CONFLICT DO NOTHING`。

## 队列与恢复

当前实现使用 PostgreSQL/SQLite 中的 `event_outbox` 作为数据库任务队列：

1. 任务和 Outbox 事件在本地 SQLite 事务中一起写入。
2. Worker 使用 `PENDING -> PROCESSING -> SENT/FAILED` 状态拉取事件。
3. `POST /api/import-worker` 可被 Cron 或独立 Worker 调用。
4. 失败任务可通过 `POST /api/import-tasks/:taskId/run` 重试。

生产环境应使用 PostgreSQL，并将 Dispatcher/Worker 部署在独立常驻进程或任务平台；Vercel 只承担 API 和页面。

## 数据降级

当前实现已加入 3 秒 SKU 查询超时和 `V4_FORCE_SKU_DEGRADED=1` 故障注入开关。触发后任务会标记 `degraded=1`，Trace 写入 `ImportTaskDegraded`，批次性能状态标记为 `DEGRADED`。

## 敏感数据

错误记录会对手机号和地址字段做基础脱敏。生产环境仍需增加操作权限和错误数据保留期限。

## 压测假设

- SKU 主数据不少于 20,000 条。
- 导入文件不少于 10,000 行。
- 采用已确认规则，不把 AI 生成规则耗时计入导入链路。
- 最终吞吐需要用 PostgreSQL 和独立 Worker 实测，不能用本地 SQLite 结果替代。
