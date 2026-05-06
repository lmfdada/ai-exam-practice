// ====================================
// AI 聊天组件 (Client Component)
// 功能：与 AI 助手实时对话
// 核心：使用 Vercel AI SDK 的 useChat Hook
// ====================================
"use client";

import { useChat } from "ai/react";

export default function ChatPanel() {
  // ✅ useChat — Vercel AI SDK 提供的 Hook
  // 自动管理消息状态、输入状态、请求发送
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat", // 指向我们的 AI 聊天接口
    });

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-5 border-b border-white/5">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            🤖 AI 助手
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            可以帮你生成留言内容、回答问题
          </p>
        </div>
        <div className={`status-badge ${error ? "offline" : "online"}`}>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: error
                ? "rgb(248, 113, 113)"
                : "rgb(74, 222, 128)",
            }}
          />
          {error ? "离线" : "在线"}
        </div>
      </div>

      {/* 聊天消息区 */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">✨</div>
              <p className="text-gray-400 text-sm mb-4">
                试试问我点什么吧！
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["帮我写一条生日祝福", "今天天气怎么样", "给我讲个笑话"].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        // 手动触发提交
                        const fakeEvent = {
                          preventDefault: () => {},
                        } as React.FormEvent;
                        handleInputChange({
                          target: { value: suggestion },
                        } as React.ChangeEvent<HTMLInputElement>);
                        // 延迟提交让 input 状态更新
                        setTimeout(() => {
                          const form = document.getElementById(
                            "chat-form"
                          ) as HTMLFormElement;
                          if (form) form.requestSubmit();
                        }, 100);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
              }
            >
              <div className="text-xs opacity-50 mb-1">
                {msg.role === "user" ? "你" : "AI 助手"}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* AI 正在思考 */}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="chat-bubble-ai">
            <div className="flex items-center gap-2">
              <div className="pulse-dot" />
              <span className="text-sm text-gray-400">AI 正在思考...</span>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            ⚠️ AI 服务暂时不可用，请检查 OPENAI_API_KEY 是否配置正确。
          </div>
        )}
      </div>

      {/* 输入框 */}
      <form
        id="chat-form"
        onSubmit={handleSubmit}
        className="p-5 border-t border-white/5"
      >
        <div className="flex gap-3">
          <input
            id="chat-input"
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="输入消息，按回车发送..."
            className="input-field flex-1"
            disabled={isLoading}
          />
          <button
            id="chat-submit-btn"
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-primary"
          >
            {isLoading ? "⏳" : "发送"}
          </button>
        </div>
      </form>
    </div>
  );
}
