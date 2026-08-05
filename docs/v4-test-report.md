# V4 阶段测试报告

## 已完成

| 检查项 | 结果 |
|---|---|
| `npm run build` | 通过 |
| V4 新增模块定向 ESLint | 通过 |
| `git diff --check` | 通过 |
| Next.js 16 动态路由类型检查 | 通过 |
| 任务页、监控页静态生成 | 通过 |
| `DATABASE_URL= SMOKE_ROWS=10 PORT=3041 npm run smoke:v4` | 通过：任务异步创建，10/10 成功，0 失败 |
| `DATABASE_URL= PORT=3053 npm run test:v4` | 通过：扩展名校验、部分成功、敏感数据脱敏、错误筛选/导出、Trace 搜索、重复消费均通过 |
| Neon PostgreSQL 本地 API 连通 | 通过：`/api/import-monitor/summary` 返回 `success:true` |
| Neon PostgreSQL SKU seed | 通过：20,000 条 SKU 写入成功 |
| Neon PostgreSQL 10,000 行冷启动压测 | 通过：后台处理 58.1 秒，10,000/10,000 成功；首次上传 10.5 秒 |
| Neon PostgreSQL 10,000 行热身压测 | 通过：后台处理 57.2 秒，10,000/10,000 成功；最佳上传 1.2 秒 |

## 本地运行方式

```bash
npm run dev
node scripts/seed-v4-data.mjs
npm run smoke:v4
npm run perf:v4
```

## 尚未完成的生产验收

- Vercel 生产域名仍需重新部署后复验；Neon Integration Secrets 已在 Vercel 控制台轮换，项目需要使用新密钥完成一次 Production Redeploy。
- PostgreSQL 实测已达到后台 60 秒目标；上传接口热身最佳约 1.2 秒，但受 Vercel/Neon 往返和冷启动影响，尚未稳定达到 1 秒上传目标。
- 当前版本没有把 Redis/BullMQ 接入生产部署，默认使用数据库 Outbox 任务队列。
- 监控页的历史趋势目前基于最近批次日志，不替代长期指标系统；长期告警仍建议接入 Vercel/外部监控。
- 完整 `npm run lint` 仍会扫描历史 `.vercel/output` 生成文件及旧版 `lib/db.ts` 的既有告警；V4 新增模块定向 lint 已通过。
