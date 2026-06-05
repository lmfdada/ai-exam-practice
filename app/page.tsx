"use client";

import { useState, useCallback, useRef } from "react";
import OrderImport from "@/components/OrderImport";
import OrderPreview from "@/components/OrderPreview";
import OrderHistory from "@/components/OrderHistory";

export interface ImportData {
  headers: string[];
  rows: string[][];
  rowCount: number;
  mapping: Record<string, string>;
  fingerprint: string;
  method: "auto" | "rule";
  ruleName?: string;
}

type ActiveView = "import";

export default function Home() {
  const [previewData, setPreviewData] = useState<ImportData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const historyRef = useRef<HTMLDivElement>(null);

  const handleImportComplete = useCallback((data: ImportData) => {
    setPreviewData(data);
  }, []);

  const handleBackToImport = useCallback(() => {
    setPreviewData(null);
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setPreviewData(null);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* ===== 侧边栏 ===== */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-img" style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: "linear-gradient(135deg, #00b9b9, #009999)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: "bold",
            color: "#fff",
          }}>
            M
          </div>
          <div>
            <div className="sidebar-logo-text">万能导入</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.2 }}>批量下单系统</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-item active">
            <span className="nav-icon">📦</span>
            <span className="nav-label">导入下单</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          V2.0 · AI 考试
        </div>
      </aside>

      {/* ===== 右侧区域 ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 顶部导航 */}
        <header className="top-header">
          <div className="top-header-title">导入下单</div>
          <div className="top-header-right">
            <span>管理员</span>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="main-content">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
            {/* 数据导入/预览区域 */}
            <div className="main-content-card" style={{ overflow: "hidden" }}>
              {!previewData ? (
                <OrderImport onImportComplete={handleImportComplete} />
              ) : (
                <OrderPreview
                  data={previewData}
                  onBack={handleBackToImport}
                  onSubmitSuccess={handleSubmitSuccess}
                />
              )}
            </div>

            {/* 历史运单 */}
            <div ref={historyRef}>
              <div className="main-content-card" style={{ overflow: "hidden", padding: 16 }}>
                <OrderHistory refreshKey={refreshKey} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
