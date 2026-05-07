"use client";

import { useState, useMemo, useCallback } from "react";
import { STANDARD_FIELDS, TEMPERATURE_OPTIONS, validateRow } from "@/lib/orders";

interface PreviewRow {
  [key: string]: string;
  external_code: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight: string;
  piece_count: string;
  temperature_level: string;
  remark: string;
}

interface ImportData {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
}

interface Props {
  data: ImportData;
  onBack: () => void;
}

function emptyRow(): PreviewRow {
  return {
    external_code: "",
    sender_name: "",
    sender_phone: "",
    sender_address: "",
    receiver_name: "",
    receiver_phone: "",
    receiver_address: "",
    weight: "",
    piece_count: "",
    temperature_level: "",
    remark: "",
  };
}

export default function OrderPreview({ data, onBack }: Props) {
  const [rows, setRows] = useState<PreviewRow[]>(() => {
    return data.rows.map((row) => {
      const r: PreviewRow = emptyRow();
      data.headers.forEach((header, i) => {
        const mappedKey = data.mapping[header];
        if (mappedKey && mappedKey in r) {
          (r as unknown as Record<string, string>)[mappedKey] = row[i] || "";
        }
      });
      return r;
    });
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitResult, setSubmitResult] = useState<{
    successCount: number;
    failCount: number;
    batchId: string;
    errors: string[];
  } | null>(null);
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<number | null>(null);

  const allErrors = useMemo(() => {
    const errMap: Record<number, string[]> = {};
    rows.forEach((row, i) => {
      const errors = validateRow(row, i, rows, existingCodes);
      if (errors.length > 0) {
        errMap[i] = errors;
      }
    });
    return errMap;
  }, [rows, existingCodes]);

  const hasErrors = Object.keys(allErrors).length > 0;

  const updateCell = useCallback(
    (rowIndex: number, field: keyof PreviewRow, value: string) => {
      setRows((prev) => {
        const next = [...prev];
        next[rowIndex] = { ...next[rowIndex], [field]: value };
        return next;
      });
    },
    []
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const deleteRow = useCallback(
    (index: number) => {
      setRows((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const fieldMeta = useMemo(() => {
    return STANDARD_FIELDS.map((f) => ({
      ...f,
      isError: (rowIndex: number) => {
        const errs = allErrors[rowIndex];
        if (!errs) return false;
        return errs.some((e) => e.includes(f.label));
      },
    }));
  }, [allErrors]);

  const handleExport = useCallback(async () => {
    const res = await fetch("/api/orders/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_preview_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  const handleSubmit = useCallback(async () => {
    if (hasErrors) return;
    setSubmitting(true);
    setSubmitProgress(0);

    const interval = setInterval(() => {
      setSubmitProgress((p) => Math.min(p + 10, 90));
    }, 300);

    try {
      const res = await fetch("/api/orders/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      clearInterval(interval);
      setSubmitProgress(100);

      const result = await res.json();
      if (result.success) {
        setSubmitResult(result.data);
        if (result.data.successCount > 0) {
          setExistingCodes((prev) => {
            const next = new Set(prev);
            rows.forEach((r) => {
              if (r.external_code) next.add(r.external_code);
            });
            return next;
          });
        }
      } else {
        setSubmitResult({ successCount: 0, failCount: rows.length, batchId: "", errors: [result.message] });
      }
    } catch {
      clearInterval(interval);
      setSubmitResult({
        successCount: 0,
        failCount: rows.length,
        batchId: "",
        errors: ["网络错误，提交失败"],
      });
    } finally {
      setSubmitting(false);
    }
  }, [rows, hasErrors]);

  const totalErrors = Object.values(allErrors).reduce((sum, e) => sum + e.length, 0);

  if (submitResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className={`text-5xl mb-4 ${submitResult.failCount === 0 ? "text-green-400" : "text-amber-400"}`}>
          {submitResult.failCount === 0 ? "✅" : "⚠️"}
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">提交完成</h3>
        <div className="text-sm text-gray-400 mb-1">成功：{submitResult.successCount} 条</div>
        {submitResult.failCount > 0 && <div className="text-sm text-red-400 mb-1">失败：{submitResult.failCount} 条</div>}
        <div className="text-xs text-gray-500 mb-6">批次号：{submitResult.batchId}</div>
        {submitResult.errors.length > 0 && (
          <div className="w-full max-w-lg mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 max-h-32 overflow-y-auto">
            {submitResult.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-2 rounded-xl bg-white/10 text-gray-300 hover:bg-white/20 transition-colors text-sm"
          >
            ↩ 继续导入
          </button>
        </div>
      </div>
    );
  }

  const errorSummary = hasErrors ? (
    Object.entries(allErrors).slice(0, expandedErrors === null ? 3 : undefined).map(([rowIndex, errs]) => (
      <div key={rowIndex} className="text-xs text-red-400">
        {errs.map((e, i) => <div key={i}>{e}</div>)}
      </div>
    ))
  ) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-white">数据预览与编辑</h3>
          <p className="text-xs text-gray-400 mt-1">
            共 {rows.length} 行 · {totalErrors > 0 ? (
              <span className="text-red-400">{totalErrors} 个错误待修复</span>
            ) : (
              <span className="text-green-400">校验通过</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            ↩ 返回
          </button>
          <button onClick={addRow} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
            + 新增行
          </button>
          <button onClick={handleExport} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
            📥 导出 Excel
          </button>
          <button
            onClick={handleSubmit}
            disabled={hasErrors || submitting}
            className={`text-xs px-4 py-1.5 rounded-lg transition-colors ${
              hasErrors || submitting
                ? "bg-gray-500/20 text-gray-500 cursor-not-allowed"
                : "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30"
            }`}
          >
            {submitting ? "提交中..." : "🚀 提交下单"}
          </button>
        </div>
      </div>

      {hasErrors && (
        <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
          <div className="text-xs font-medium text-red-400 mb-1">
            请先修正所有错误后再提交（共 {totalErrors} 个错误）
            {Object.keys(allErrors).length > 3 && expandedErrors === null && (
              <button onClick={() => setExpandedErrors(Infinity as unknown as number)} className="ml-2 text-indigo-400 hover:text-indigo-300">
                展开全部
              </button>
            )}
            {expandedErrors !== null && Object.keys(allErrors).length > 3 && (
              <button onClick={() => setExpandedErrors(null)} className="ml-2 text-indigo-400 hover:text-indigo-300">
                收起
              </button>
            )}
          </div>
          {errorSummary}
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800">
                <th className="p-2 text-center text-gray-400 font-medium w-10 sticky left-0 bg-gray-800 z-20">#</th>
                <th className="p-2 text-center text-gray-400 font-medium w-16 sticky left-[40px] bg-gray-800 z-20">操作</th>
                {STANDARD_FIELDS.map((f) => (
                  <th key={f.key} className="p-2 text-left text-gray-300 font-medium whitespace-nowrap min-w-[130px]">
                    {f.label}
                    {f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`border-t border-white/5 transition-colors ${
                    allErrors[rowIndex] ? "bg-red-500/5" : "hover:bg-white/5"
                  }`}
                >
                  <td className="p-2 text-center text-gray-500 sticky left-0 bg-gray-900/80 z-10">
                    {rowIndex + 1}
                  </td>
                  <td className="p-2 text-center sticky left-[40px] bg-gray-900/80 z-10">
                    <button
                      onClick={() => deleteRow(rowIndex)}
                      className="text-red-400 hover:text-red-300 text-xs"
                      title="删除此行"
                    >
                      ✕
                    </button>
                  </td>
                  {STANDARD_FIELDS.map((f) => {
                    const cellValue = row[f.key] || "";
                    const isError = allErrors[rowIndex]?.some((e) => e.includes(f.label));
                    const isEditing = editingCell?.row === rowIndex && editingCell?.field === f.key;

                    return (
                      <td
                        key={f.key}
                        className={`p-1 border-l border-white/5 ${isError ? "bg-red-500/10" : ""}`}
                        title={
                          isError
                            ? allErrors[rowIndex]?.find((e) => e.includes(f.label)) || ""
                            : ""
                        }
                      >
                        {f.key === "temperature_level" ? (
                          <select
                            value={cellValue}
                            onChange={(e) => updateCell(rowIndex, f.key as keyof PreviewRow, e.target.value)}
                            className={`w-full bg-transparent border rounded-lg px-2 py-1.5 outline-none transition-colors ${
                              isError
                                ? "border-red-400 text-red-300"
                                : "border-transparent text-gray-200 focus:border-indigo-400"
                            }`}
                          >
                            <option value="">选择...</option>
                            {TEMPERATURE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={cellValue}
                            onChange={(e) => updateCell(rowIndex, f.key as keyof PreviewRow, e.target.value)}
                            onFocus={() => setEditingCell({ row: rowIndex, field: f.key })}
                            onBlur={() => setEditingCell(null)}
                            placeholder={f.required ? "必填" : "选填"}
                            className={`w-full bg-transparent border rounded-lg px-2 py-1.5 outline-none transition-colors ${
                              isError
                                ? "border-red-400 text-red-300 placeholder-red-300/50"
                                : "border-transparent text-gray-200 focus:border-indigo-400"
                            }`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-gray-500">
          {rows.length > 0 && (
            <span>已加载 {rows.length} 行数据</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={addRow} className="text-xs px-4 py-2 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 transition-colors">
            + 新增一行
          </button>
        </div>
      </div>
    </div>
  );
}
