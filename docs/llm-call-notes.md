# 大模型调用说明

## 调用目的

本项目的大模型能力只用于辅助生成 V2 解析规则。AI 分析上传文件的表头和样例内容，输出一份 JSON 解析规则，用户确认后保存规则，再由确定后的规则参与后续导入。

V4 异步导入主链路、10,000 行压测、SKU 校验、批量写库和任务调度不依赖大模型调用。

## 代码位置

- 调用封装：`lib/ai.ts`
- 规则生成接口：`app/api/rules/generate/route.ts`
- 规则管理页面：`/rules`

## 环境变量

| 变量 | 说明 |
|---|---|
| `AI_API_KEY` / `OPENAI_API_KEY` | 大模型 API Key，优先使用 `AI_API_KEY` |
| `AI_BASE_URL` | 大模型服务地址，默认 `https://api.deepseek.com/v1` |
| `AI_MODEL` | 模型名，默认 `deepseek-chat` |

所有密钥只通过环境变量配置，不提交到源码仓库。

## 请求方式

接口使用 Chat Completions 风格调用：

```text
POST {AI_BASE_URL}/chat/completions
Authorization: Bearer ${AI_API_KEY}
Content-Type: application/json
```

主要参数：

```json
{
  "model": "${AI_MODEL}",
  "temperature": 0.2,
  "max_tokens": 4096
}
```

超时时间为 60 秒。

## Prompt 摘要

系统提示要求模型扮演“文件解析规则生成器”，只输出 JSON。

用户提示包含：

- 文件名、文件类型、文件内容预览；
- 标准字段列表；
- 解析规则 JSON 格式要求；
- Sheet 选择、表头识别、列映射和后处理步骤说明；
- 对不确定字段标记 `isSpeculative=true`，要求用户确认。

## 返回结果处理

模型返回后，系统会：

1. 去除 Markdown 代码块标记；
2. 解析 JSON；
3. 转为项目内部 `ParseRule` 结构；
4. 对推测性映射做二次标记；
5. 返回给前端由用户确认保存。

## 失败与降级

- 未配置 API Key 时，接口返回错误提示，不影响手动创建/维护解析规则。
- 大模型调用失败、超时或返回非 JSON 时，接口返回错误，不进入 V4 导入主链路。
- V4 压测使用已确认规则，大模型耗时不计入 10,000 行导入性能指标。

## 安全说明

- 文件内容只截取前 8000 字符作为结构分析摘要。
- API Key、Base URL、模型名均通过环境变量配置。
- 大模型不直接写数据库订单数据，只生成候选解析规则。
