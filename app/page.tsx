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
    <div className="min-h-screen p-1">
      <div className="max-w-full mx-auto px-2">
        <div className="mb-3 px-2 pt-2">
          <h1 className="text-lg font-bold gradient-text">物流批量下单系统</h1>
        </div>

        <div className="glass-card glow-border rounded-xl px-4 py-3 mb-3">
          {previewData ? (
            <OrderPreview data={previewData} onBack={handleBack} />
          ) : (
            <OrderImport onImportComplete={handleImportComplete} />
          )}
        </div>

        <div className="glass-card glow-border rounded-xl px-4 py-3">
          <div className="text-sm font-medium text-white mb-3">📋 历史运单记录</div>
          <OrderHistory />
        </div>
      </div>
    </div>
  );
}
