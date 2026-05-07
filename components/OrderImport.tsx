"use client";

import { useState, useRef, useCallback } from "react";
import { STANDARD_FIELDS } from "@/lib/orders";

interface ParsedData {
  headers: string[];
  rows: string[][];
  autoMapping: Record<string, string>;
  fingerprint: string;
  totalRows: number;
}

interface Props {
  onImportComplete: (data: ParsedData, mapping: Record<string, string>) => void;
}

export default function OrderImport({ onImportComplete }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyMapping = useCallback((p: ParsedData) => {
    setMapping({ ...p.autoMapping });
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setError("");
    setProgress(0);
    setParsed(null);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 15, 80));
    }, 200);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/orders/import", {
        method: "POST",
        body: formData,
      });

      clearInterval(interval);
      setProgress(100);

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "解析失败");
        return;
      }

      const p = data.data as ParsedData;

      const templateRes = await fetch(`/api/templates?fingerprint=${encodeURIComponent(p.fingerprint)}`);
      const templateData = await templateRes.json();

      if (templateData.success && templateData.data) {
        setMapping(templateData.data.mapping as Record<string, string>);
      } else {
        setMapping({ ...p.autoMapping });
      }

      setParsed(p);
    } catch {
      clearInterval(interval);
      setError("网络错误，请重试");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const saveMapping = useCallback(async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: parsed.fingerprint, mapping }),
      });
    } catch {
    } finally {
      setSaving(false);
    }
  }, [parsed, mapping]);

  const confirmMapping = useCallback(() => {
    if (!parsed) return;
    onImportComplete(parsed, mapping);
  }, [parsed, mapping, onImportComplete]);

  if (parsed) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-white">列映射确认</h3>
            <p className="text-xs text-gray-400 mt-1">
              文件：{parsed.totalRows} 行 · 检测到 {parsed.headers.length} 列
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setParsed(null); setMapping({}); }}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              ↩ 重新选择
            </button>
            <button
              onClick={() => applyMapping(parsed)}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              🔄 自动映射
            </button>
            <button
              onClick={async () => { await saveMapping(); confirmMapping(); }}
              className="text-xs px-4 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
            >
              {saving ? "保存中..." : "✅ 确认导入"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-white/10 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/5">
                <th className="p-3 text-left text-gray-300 font-medium whitespace-nowrap">Excel 列名</th>
                <th className="p-3 text-left text-gray-300 font-medium whitespace-nowrap">映射到系统字段</th>
              </tr>
            </thead>
            <tbody>
              {parsed.headers.map((header) => (
                <tr key={header} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3 text-gray-300 font-mono">{header}</td>
                  <td className="p-3">
                    <select
                      value={mapping[header] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-gray-200 text-xs w-48"
                    >
                      <option value="">— 不导入 —</option>
                      {STANDARD_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} {f.required ? "*" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          💡 系统已根据列名自动匹配，您可以手动调整映射关系。确认后进入数据预览。
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-white/20 hover:border-indigo-400/50 hover:bg-white/5"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        {uploading ? (
          <div>
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-gray-300 text-sm mb-3">正在解析文件...</p>
            <div className="max-w-xs mx-auto bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">{progress}%</p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">📂</div>
            <p className="text-gray-300 text-sm mb-1">
              拖拽 Excel 文件到此处，或<span className="text-indigo-400">点击选择文件</span>
            </p>
            <p className="text-xs text-gray-500">支持 .xlsx / .xls 格式</p>
          </div>
        )}
      </div>
    </div>
  );
}
