/**
 * AI 辅助生成规则
 *
 * 将文件内容发送到大模型，让 AI 分析文件结构并生成解析规则。
 * AI 生成的是"规则"而不是直接解析数据——用户需要确认后保存规则，
 * 再用规则去解析文件。
 */

import type { ParseRule, RuleConfig, ColumnMapping } from "./rules";
import { STANDARD_FIELDS } from "./orders";

/** 大模型调用配置 */
interface AIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/** 获取 AI 配置 */
function getAIConfig(): AIConfig {
  return {
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.AI_BASE_URL || "https://api.deepseek.com/v1",
    model: process.env.AI_MODEL || "deepseek-chat",
  };
}

/** 将原始文件内容转为 AI 可分析的文本摘要 */
function buildFileSummary(fileContent: string, fileType: string, fileName: string): string {
  return `文件名: ${fileName}
文件类型: ${fileType}
文件内容预览:
${fileContent.slice(0, 8000)}`;
}

/** 构建 AI Prompt */
function buildPrompt(fileSummary: string): string {
  const fieldsDesc = STANDARD_FIELDS.map(
    (f) => `  - "${f.key}" (${f.label})${f.required ? " [必填]" : ""}`
  ).join("\n");

  return `你是一个文件解析规则生成器。分析下面上传的文件内容，生成一条解析规则。

## 目标字段（标准字段）
${fieldsDesc}

## 规则格式要求
生成 JSON 格式的规则配置，包含以下部分：

1. **name**: 规则名称（简短描述）
2. **description**: 规则描述
3. **fileTypes**: 适用的文件类型数组
4. **config.sheets**: 如何选择 Sheet，可填 "auto"（自动检测）、"all"（全部合并）或 [0,1]（指定索引）
5. **config.headerDetection**: "auto" 或 {"row": 行号}
6. **config.skipRowsBeforeHeader**: 表头前跳过的行数
7. **config.columns**: 列映射数组，每个元素包含：
   - sourceIndex: 源列索引（0-based）或 sourceHeader: 源列表头名称
   - targetField: 映射到的标准字段名
   - defaultValue: （可选）默认值
8. **config.steps**: 后处理步骤数组，每个元素包含 type 和 config：
   - 类型可选: "skip_rows_before_header", "skip_rows_after_header", "extract_tail_info", "aggregate_by_field", "transpose_matrix", "card_split", "composite_split", "static_value", "regex_extract"
   - config 字段根据类型不同：
     * static_value: { field: "target_field", value: "固定值" }
     * aggregate_by_field: { field: "external_code" }
     * extract_tail_info: { rowCount: 1, fieldMapping: { "receiver_name": 1, "receiver_phone": 2 } }
     * transpose_matrix: { rowField: "sku_name", colFields: ["门店1","门店2"], valueField: "sku_qty" }
     * regex_extract: { sourceField: "源字段", pattern: "正则表达式", targetField: "目标字段" }

## 重要说明
- AI 分析的是文件结构，不是直接提取数据
- 对于包含"收货门店"列的文件，使用 A 组模式
- 对于包含"收件人姓名/电话/地址"列的文件，使用 B 组模式
- 对表头行和前几行数据进行分析，推断正确的列索引
- 如果某列没有对应标准字段，可以留空不映射
- 如果文件中有合并单元格、跨行表头等复杂情况，在 steps 中配置对应的处理步骤

## 输入文件
${fileSummary}

## 输出格式
请只输出 JSON，不要有其他文字：
{
  "name": "...",
  "description": "...",
  "fileTypes": [...],
  "config": { ... }
}`;
}

export interface AIGenerateResult {
  success: boolean;
  rule?: Partial<ParseRule>;
  error?: string;
}

/**
 * 调用大模型生成解析规则
 */
export async function generateRuleFromFile(
  textContent: string,
  fileType: string,
  fileName: string
): Promise<AIGenerateResult> {
  const aiConfig = getAIConfig();

  if (!aiConfig.apiKey) {
    return {
      success: false,
      error: "未配置 AI API Key，请在环境变量中设置 AI_API_KEY 或 OPENAI_API_KEY",
    };
  }

  const fileSummary = buildFileSummary(textContent, fileType, fileName);
  const prompt = buildPrompt(fileSummary);

  try {
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: "你是一个专业的文件解析规则生成器。你只输出 JSON，不输出其他内容。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `AI 服务调用失败 (${response.status}): ${errText}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { success: false, error: "AI 返回内容为空" };
    }

    // 解析 AI 返回的 JSON
    const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const aiResult = JSON.parse(jsonStr);

    const rule: Partial<ParseRule> = {
      name: aiResult.name || fileName.replace(/\.[^.]+$/, ""),
      description: aiResult.description || `AI 为 ${fileName} 生成的解析规则`,
      fileTypes: aiResult.fileTypes || ["xlsx"],
      config: aiResult.config as RuleConfig,
    };

    return { success: true, rule };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `AI 调用异常: ${errMsg}` };
  }
}

/**
 * 从文件中提取文本内容（用于 AI 分析）
 * 根据文件类型提取可读的文本摘要
 */
export async function extractTextForAI(
  file: File,
  fileType: string
): Promise<string> {
  const buffer = await file.arrayBuffer();

  if (fileType === "xlsx" || fileType === "xls") {
    // 对于 Excel，读取为 base64 让 AI 分析（或者用简化的文本表示）
    // 这里只返回文件名和基本信息，实际使用时后端解析后传给 AI
    return `[Excel 文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB, 需要后端解析]`;
  }

  if (fileType === "pdf") {
    return `[PDF 文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB, 需要后端解析]`;
  }

  if (fileType === "docx") {
    return `[Word 文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB, 需要后端解析]`;
  }

  // 纯文本
  return new TextDecoder().decode(buffer).slice(0, 10000);
}
