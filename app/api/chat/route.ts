// ====================================
// AI 聊天接口
// POST /api/chat → 接收聊天消息，返回 AI 流式响应
// ====================================
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, StreamingTextResponse } from "ai";

// 允许流式响应的最大时长
export const maxDuration = 30;

// 创建自定义的 OpenAI Provider，指向 DeepSeek 接口
const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // 调用 DeepSeek 模型，返回流式响应
    const result = streamText({
      model: deepseek("deepseek-chat"), // 使用 DeepSeek 的对话模型
      system:
        "你是一个友好的 AI 助手，可以帮用户生成留言内容、回答问题。回复请简洁明了，使用中文。",
      messages,
    });

    // 返回流式数据
    return new StreamingTextResponse(result.toAIStream());
  } catch (error) {
    console.error("AI 聊天失败:", error);
    return new Response(
      JSON.stringify({
        error: "AI 服务暂时不可用，请检查 OPENAI_API_KEY 是否配置正确。",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
