This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## V4 异步导入任务

V4 任务工作台位于 `/import-tasks`。它在现有 V2 解析规则之上新增了数据库任务队列、Outbox、分批 Worker、任务进度、行级错误、性能日志和 Trace 查询。

本地启动后：

```bash
npm run dev
open http://localhost:3000/import-tasks
```

创建压测数据：

```bash
node scripts/seed-v4-data.mjs
```

需要故意制造少量非法 SKU 来验证错误定位时：

```bash
INVALID_SKU_EVERY=1000 node scripts/seed-v4-data.mjs
```

真实任务链路压测：

```bash
npm run smoke:v4
npm run test:v4
npm run perf:v4
```

`test:v4` 使用 SQLite 验证扩展名校验、部分成功、敏感数据脱敏和重复消费；压测脚本会上传 10,000 行 Excel，轮询任务直到结束，并输出上传耗时、后台处理耗时、成功/失败行数和是否达到 60 秒目标。

当前默认 Worker 使用数据库任务队列，方便本地和无 Redis 环境运行；生产部署应使用 PostgreSQL，并将 Worker/Dispatcher 放到独立常驻进程或任务平台中。任务接口：

生产环境建议配置 `DATABASE_URL`、`V4_WORKER_TOKEN` 和 `V4_ADMIN_TOKEN`。生产数据库表结构已初始化后，可配置 `V4_ASSUME_SCHEMA_READY=1` 跳过冷启动建表检查，降低上传接口延迟。Dispatcher 调用示例：

```bash
curl -X POST "http://localhost:3000/api/import-worker?limit=5" \
  -H "x-worker-token: $V4_WORKER_TOKEN"
```

- `POST /api/import-tasks`
- `GET /api/import-tasks/:taskId`
- `GET /api/import-tasks/:taskId/errors?batch=4&error_code=E001&page=1&page_size=50`
- `GET /api/import-tasks/:taskId/errors/export`
- `POST /api/import-tasks/:taskId/run`
- `GET /api/traces/:traceId`
- `GET /api/traces?task_id=...&filename=...&batch=...&row_from=...&row_to=...&error_code=...`
- `GET /api/import-monitor/summary`
- `POST /api/import-worker?limit=5`
- `GET /api/import-tasks/:taskId/batches`
- `POST /api/import-monitor/seed`（生产环境需要 `V4_ADMIN_TOKEN`）

配套文档：

- `docs/v4-assumptions.md`
- `docs/v4-interface.md`
- `docs/v4-test-report.md`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
