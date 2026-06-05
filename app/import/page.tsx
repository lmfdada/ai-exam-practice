"use client";

import { useState, useCallback } from "react";
import OrderImport from "@/components/OrderImport";
import OrderPreview from "@/components/OrderPreview";

export interface ImportData {
  headers: string[];
  rows: string[][];
  rowCount: number;
  mapping: Record<string, string>;
  fingerprint: string;
  method: "auto" | "rule";
  ruleName?: string;
}

export default function ImportPage() {
  const [previewData, setPreviewData] = useState<ImportData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
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
    </div>
  );
}
