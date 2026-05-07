// ====================================
// 首页 — 左侧留言板 + 右侧 AI 聊天
// ====================================
import MessageBoard from "@/components/MessageBoard";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/25">
              AI
            </div>
            <div>
              <h1 className="text-base font-semibold gradient-text">
                AI 智能留言板
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/api/setup"
              target="_blank"
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              🔧 初始化数据库
            </a>
          </div>
        </div>
      </header>

      {/* 主体内容 — 双栏布局 */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：留言板 */}
        <div className="glass-card glow-border overflow-hidden flex flex-col min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-120px)]">
          <MessageBoard />
        </div>

        {/* 右侧：AI 聊天 */}
        <div className="glass-card glow-border overflow-hidden flex flex-col min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-120px)]">
          <ChatPanel />
        </div>
      </div>
    </main>
  );
}
