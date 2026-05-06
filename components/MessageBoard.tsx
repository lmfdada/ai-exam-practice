// ====================================
// 留言板组件 (Client Component)
// 功能：展示留言列表 + 发布新留言 + 删除留言
// ====================================
"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// 留言类型定义
interface Message {
  id: number;
  author: string;
  content: string;
  created_at: string;
}

export default function MessageBoard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ 查询所有留言（GET）
  const fetchMessages = useCallback(async () => {
    try {
      setFetching(true);
      const res = await fetch("/api/messages");
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
      } else {
        setError("获取留言失败：" + data.message);
      }
    } catch (err) {
      setError("网络错误，请检查数据库连接。提示：先访问 /api/setup 建表");
      console.error(err);
    } finally {
      setFetching(false);
    }
  }, []);

  // 页面加载时获取留言
  useEffect(() => {
    const load = async () => {
      setFetching(true);
      try {
        const res = await fetch("/api/messages");
        const data = await res.json();
        if (data.success) {
          setMessages(data.data);
        } else {
          setError("获取留言失败：" + data.message);
        }
      } catch (err) {
        setError("网络错误，请检查数据库连接。提示：先访问 /api/setup 建表");
        console.error(err);
      } finally {
        setFetching(false);
      }
    };
    load();
  }, []);

  // ✅ 发布新留言（POST）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !content.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author.trim(), content: content.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setContent(""); // 清空内容，保留作者名
        fetchMessages(); // 重新获取列表
      } else {
        setError("发布失败：" + data.message);
      }
    } catch (err) {
      setError("发布失败，请重试");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 删除留言（DELETE）
  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这条留言吗？")) return;

    try {
      const res = await fetch(`/api/messages?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (data.success) {
        fetchMessages(); // 重新获取列表
      } else {
        setError("删除失败：" + data.message);
      }
    } catch (err) {
      setError("删除失败，请重试");
      console.error(err);
    }
  };

  // ✅ 导出留言
  const handleExport = (format: "json" | "csv") => {
    window.open(`/api/messages/export?format=${format}`, "_blank");
  };

  // ✅ 导入留言
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/messages/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        fetchMessages();
        alert(data.message);
      } else {
        setError("导入失败：" + data.message);
      }
    } catch (err) {
      setError("导入失败，请重试");
      console.error(err);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 标题栏 */}
      <div className="flex items-center justify-between p-5 border-b border-white/5">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📋 留言板
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            共 {messages.length} 条留言
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 disabled:opacity-50"
          >
            {importing ? "导入中..." : "📥 导入"}
          </button>
          <div className="relative group">
            <button className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
              📤 导出 ▾
            </button>
            <div className="absolute right-0 top-full mt-1 w-28 bg-gray-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
              <button
                onClick={() => handleExport("json")}
                className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                JSON
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                CSV
              </button>
            </div>
          </div>
          <button
            onClick={fetchMessages}
            className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 发布表单 */}
      <form onSubmit={handleSubmit} className="p-5 border-b border-white/5">
        <div className="flex gap-3 mb-3">
          <input
            id="author-input"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="你的名字"
            className="input-field flex-shrink-0"
            style={{ width: "120px" }}
            maxLength={20}
          />
          <input
            id="content-input"
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你的留言..."
            className="input-field flex-1"
            maxLength={500}
          />
        </div>
        <button
          id="submit-message-btn"
          type="submit"
          disabled={loading || !author.trim() || !content.trim()}
          className="btn-primary w-full"
        >
          {loading ? "发布中..." : "✨ 发布留言"}
        </button>
      </form>

      {/* 留言列表 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {fetching ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="pulse-dot" />
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-gray-400 text-sm">还没有留言，来发第一条吧！</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="message-card p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium text-indigo-400">
                      {msg.author}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed break-words">
                    {msg.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(msg.id)}
                  className="btn-danger opacity-0 group-hover:opacity-100 transition-opacity ml-3 flex-shrink-0"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
