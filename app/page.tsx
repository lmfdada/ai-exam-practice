"use client";

import { useState, useCallback } from "react";
import OrderImport from "@/components/OrderImport";
import OrderPreview from "@/components/OrderPreview";
import OrderHistory from "@/components/OrderHistory";

interface ParsedData {
  headers: string[];
  rows: string[][];
  autoMapping: Record<string, string>;
  fingerprint: string;
  totalRows: number;
}

export default function Home() {
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
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex flex-col min-h-0 flex-1 gap-1.5 px-4 max-w-8xl mx-auto w-full">
        <div className="pt-1.5 shrink-0">
          <h1 className="text-lg font-bold gradient-text">物流批量下单系统</h1>
        </div>

        <div className={`glass-card glow-border rounded-lg px-4 py-2.5 ${previewData ? "flex-1 min-h-0 overflow-hidden" : "shrink-0"}`}>
          {previewData ? (
            <OrderPreview data={previewData} onBack={handleBack} />
          ) : (
            <OrderImport onImportComplete={handleImportComplete} />
          )}
        </div>

        <div className="glass-card glow-border rounded-lg px-4 py-2.5 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="text-sm font-medium text-white mb-2 shrink-0">📋 历史运单记录</div>
          <OrderHistory />
        </div>
      </div>
    </div>
  );
}
