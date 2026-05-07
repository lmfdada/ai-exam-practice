"use client";

import { useState, useCallback } from "react";
import OrderImport from "@/components/OrderImport";
import OrderPreview from "@/components/OrderPreview";
import OrderHistory from "@/components/OrderHistory";
import ChatPanel from "@/components/ChatPanel";

interface ParsedData {
  headers: string[];
  rows: string[][];
  autoMapping: Record<string, string>;
  fingerprint: string;
  totalRows: number;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"import" | "history">("import");
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: string[][]; mapping: Record<string, string> } | null>(null);

  const handleImportComplete = useCallback(
    (data: ParsedData, mapping: Record<string, string>) => {
      setPreviewData({ headers: data.headers, rows: data.rows, mapping });
    },
    []
  );

  const handleBack = useCallback(() => {
    setPreviewData(null);
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold gradient-text">物流批量下单系统</h1>
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setActiveTab("import")}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                activeTab === "import"
                  ? "bg-indigo-500/20 text-indigo-300 shadow-sm"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              📥 批量导入
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                activeTab === "history"
                  ? "bg-indigo-500/20 text-indigo-300 shadow-sm"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              📋 运单管理
            </button>
          </div>
        </div>

        <div className="glass-card glow-border rounded-2xl p-6">
          {activeTab === "import" ? (
            previewData ? (
              <OrderPreview data={previewData} onBack={handleBack} />
            ) : (
              <OrderImport onImportComplete={handleImportComplete} />
            )
          ) : (
            <OrderHistory />
          )}
        </div>

        {activeTab === "import" && !previewData && (
          <div className="mt-6 glass-card glow-border rounded-2xl p-6">
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  );
}
