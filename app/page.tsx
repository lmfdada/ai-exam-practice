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
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-dark)",
    }}>
      {/* ===== 顶部导航 ===== */}
      <header style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border-color)",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          height: 60,
          gap: 16,
        }}>
          {/* Logo */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: "bold",
              color: "#000",
            }}>
              M
            </div>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}>
                万能导入 V2
              </div>
              <div style={{
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.2,
              }}>
                智能多格式批量下单
              </div>
            </div>
          </div>

          {/* 空间占位 */}
          <div style={{ flex: 1 }} />

          {/* 导航链接 */}
          <nav style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn btn-ghost btn-sm ${!previewData ? "active" : ""}`}
              onClick={handleBackToImport}
              style={!previewData ? { color: "var(--primary)", background: "var(--primary-bg)" } : undefined}
            >
              导入
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => historyRef.current?.scrollIntoView({ behavior: "smooth" })}
            >
              历史运单
            </button>
          </nav>
        </div>
      </header>

      {/* ===== 主内容区 ===== */}
      <main style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: "20px 24px",
      }}>
        {/* 数据导入/预览区域 */}
        <div className="card" style={{
          padding: 0,
          overflow: "hidden",
        }}>
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
        <div ref={historyRef} style={{ marginTop: 24 }}>
          <OrderHistory refreshKey={refreshKey} />
        </div>
      </main>
    </div>
  );
}
