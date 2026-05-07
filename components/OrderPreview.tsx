"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

const PAGE_SIZE = 50;
const SUBMIT_BATCH_SIZE = 200;

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

function getFieldLabel(key: string): string {
  const field = STANDARD_FIELDS.find((f) => f.key === key);
  return field ? field.label : key;
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
  const [submitProgress, setSubmitProgress] = useState<{
    completed: number;
    total: number;
    currentBatch: number;
  } | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    successCount: number;
    failCount: number;
    batchId: string;
    errors: string[];
  } | null>(null);
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    fetch("/api/orders/codes")
      .then((res) => res.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          setExistingCodes(new Set(result.data as string[]));
        }
      })
      .catch(() => {});
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows.length]);
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, rows.length);
  const currentRows = useMemo(() => rows.slice(pageStart, pageEnd), [rows, pageStart, pageEnd]);

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

  const errorRows = useMemo(() => Object.keys(allErrors).map(Number), [allErrors]);
  const totalErrors = useMemo(
    () => Object.values(allErrors).reduce((sum, e) => sum + e.length, 0),
    [allErrors]
  );
  const hasErrors = totalErrors > 0;

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

  const startEditing = useCallback((rowIndex: number, field: string) => {
    setEditingCell({ row: rowIndex, field });
  }, []);

  const confirmEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, field: keyof PreviewRow, value: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        updateCell(rowIndex, field, value);
        setEditingCell(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingCell(null);
      } else if (e.key === "Tab") {
        setEditingCell(null);
      }
    },
    [updateCell]
  );

  useEffect(() => {
    if (editingCell) {
      const timer = setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
        if (selectRef.current) selectRef.current.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editingCell]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
    setPage(totalPages);
  }, [totalPages]);

  const deleteRow = useCallback(
    (index: number) => {
      setRows((prev) => prev.filter((_, i) => i !== index));
      setHoveredCell(null);
    },
    []
  );

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

    const batchId = `B${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const totalBatches = Math.ceil(rows.length / SUBMIT_BATCH_SIZE);
    let totalSuccess = 0;
    let totalFail = 0;
    const allErrors: string[] = [];

    setSubmitting(true);
    setSubmitProgress({ completed: 0, total: totalBatches, currentBatch: 0 });

    for (let b = 0; b < totalBatches; b++) {
      const batchRows = rows.slice(b * SUBMIT_BATCH_SIZE, (b + 1) * SUBMIT_BATCH_SIZE);

      setSubmitProgress({ completed: b, total: totalBatches, currentBatch: b + 1 });

      try {
        const res = await fetch("/api/orders/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batchRows, batchId }),
        });

        const result = await res.json();
        if (result.success) {
          totalSuccess += result.data.successCount;
          totalFail += result.data.failCount;
          if (result.data.errors?.length > 0) {
            allErrors.push(...result.data.errors);
          }
        } else {
          totalFail += batchRows.length;
          allErrors.push(`批次 ${b + 1}/${totalBatches} 提交失败：${result.message}`);
        }
      } catch {
        totalFail += batchRows.length;
        allErrors.push(`批次 ${b + 1}/${totalBatches} 网络错误，请重试`);
      }

      setSubmitProgress({ completed: b + 1, total: totalBatches, currentBatch: b + 1 });
    }

    setSubmitting(false);
    setSubmitProgress(null);
    setSubmitResult({ successCount: totalSuccess, failCount: totalFail, batchId, errors: allErrors });

    if (totalSuccess > 0) {
      setExistingCodes((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => {
          if (r.external_code) next.add(r.external_code);
        });
        return next;
      });
    }
  }, [rows, hasErrors]);

  if (submitResult) {
    const allSucceeded = submitResult.failCount === 0;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className={`text-5xl mb-4 ${allSucceeded ? "text-green-400" : "text-amber-400"}`}>
          {allSucceeded ? "✅" : "⚠️"}
        </div>
        <h3 className="text-lg font-semibold text-white mb-4">提交完成</h3>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-full max-w-sm mb-6">
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm text-gray-400">提交总数</span>
            <span className="text-sm text-white font-medium">{submitResult.successCount + submitResult.failCount} 条</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-t border-white/5">
            <span className="text-sm text-gray-400">成功</span>
            <span className="text-sm text-green-400 font-medium">{submitResult.successCount} 条</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-t border-white/5">
            <span className="text-sm text-gray-400">失败</span>
            <span className={`text-sm font-medium ${submitResult.failCount > 0 ? "text-red-400" : "text-gray-500"}`}>
              {submitResult.failCount} 条
            </span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-t border-white/5">
            <span className="text-sm text-gray-400">批次号</span>
            <span className="text-xs text-gray-500 font-mono">{submitResult.batchId}</span>
          </div>
        </div>
        {submitResult.errors.length > 0 && (
          <div className="w-full max-w-sm mb-6">
            <div className="text-xs text-red-400/80 mb-2 font-medium">
              失败详情（{submitResult.errors.length} 条）：
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400/90 max-h-32 overflow-y-auto space-y-1">
              {submitResult.errors.map((e, i) => (
                <div key={i} className="leading-relaxed">{e}</div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          {allSucceeded ? (
            <button
              onClick={onBack}
              className="px-6 py-2 rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors text-sm"
            >
              ↩ 继续导入
            </button>
          ) : (
            <button
              onClick={() => setSubmitResult(null)}
              className="px-6 py-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm"
            >
              ↩ 返回修改
            </button>
          )}
        </div>
      </div>
    );
  }

  const errorListItems = Object.entries(allErrors).slice(0, 100).flatMap(([rowIndex, errs]) =>
    errs.map((e, i) => ({ key: `${rowIndex}-${i}`, text: e }))
  );
  const hasMoreErrors = Object.keys(allErrors).length > 100;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-medium text-white">📋 数据预览与编辑</h3>
          <p className="text-xs text-gray-400 mt-1">
            {rows.length > PAGE_SIZE
              ? `共 ${rows.length} 行，显示第 ${pageStart + 1}-${pageEnd} 行`
              : `共 ${rows.length} 行`}
            {rows.length > 500 && (
              <span className="text-amber-400 ml-2">⚠ 批量数据</span>
            )}
            {hasErrors ? (
              <span className="text-red-400 ml-2 font-medium">
                ❌ {totalErrors} 个错误待修复
              </span>
            ) : rows.length > 0 ? (
              <span className="text-green-400 ml-2">✅ 全部校验通过</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            ↩ 返回
          </button>
          <button
            onClick={addRow}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
          >
            + 新增行
          </button>
          <button
            onClick={handleExport}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            📥 导出
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
            {submitting
              ? `提交中 ${submitProgress ? `${Math.round((submitProgress.completed / submitProgress.total) * 100)}%` : "..."}`
              : "🚀 提交下单"}
          </button>
        </div>
      </div>

      {submitting && submitProgress && (
        <div className="mb-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-indigo-400 font-medium">
              正在提交数据
              {submitProgress.total > 1 && `（第 ${submitProgress.currentBatch}/${submitProgress.total} 批）`}
            </span>
            <span className="text-gray-400 tabular-nums">
              {Math.round((submitProgress.completed / submitProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(submitProgress.completed / submitProgress.total) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1.5">
            <span>共 {rows.length} 条数据</span>
            <span>每批 {SUBMIT_BATCH_SIZE} 条 · 共 {submitProgress.total} 批</span>
          </div>
        </div>
      )}

      {hasErrors && !submitting && (
        <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-red-500/10">
            <div className="text-sm font-medium text-red-400">
              发现 {totalErrors} 个错误，涉及 {errorRows.length} 行
            </div>
            <div className="text-xs text-red-400/70 mt-0.5">
              请修正所有错误后再提交
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {errorListItems.map((item) => {
              const match = item.text.match(/第 (\d+) 行/);
              const rowLink = match ? match[1] : null;
              return (
                <div
                  key={item.key}
                  className="px-3 py-1.5 text-xs text-red-300 border-b border-red-500/5 hover:bg-red-500/10 transition-colors flex items-start gap-2"
                >
                  <span className="text-red-500 mt-0.5 shrink-0">●</span>
                  <span>{item.text}</span>
                  {rowLink && (
                    <button
                      onClick={() => {
                        const targetPage = Math.ceil(Number(rowLink) / PAGE_SIZE);
                        setPage(targetPage);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 underline ml-auto shrink-0"
                    >
                      跳转
                    </button>
                  )}
                </div>
              );
            })}
            {hasMoreErrors && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                ... 仅显示前 100 条错误
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden flex-1 min-h-0">
        <div className="h-full overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-800">
                <th className="p-2 text-center text-gray-400 font-medium w-10 sticky left-0 bg-gray-800 z-30 border-r border-white/10">
                  #
                </th>
                <th className="p-2 text-center text-gray-400 font-medium w-12 sticky left-10 bg-gray-800 z-30 border-r border-white/10">
                  操作
                </th>
                {STANDARD_FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="p-2 text-left text-gray-300 font-medium whitespace-nowrap min-w-[140px] border-r border-white/5 last:border-r-0"
                  >
                    {f.label}
                    {f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, pi) => {
                const rowIndex = pageStart + pi;
                const rowErrors = allErrors[rowIndex] || [];
                const hasRowError = rowErrors.length > 0;

                return (
                  <tr
                    key={rowIndex}
                    className={`border-t border-white/5 transition-colors ${
                      hasRowError ? "bg-red-500/5" : "hover:bg-white/5"
                    }`}
                  >
                    <td className="p-0 sticky left-0 bg-gray-900/95 z-10 border-r border-white/10">
                      <div className="flex items-center justify-center h-full min-h-[36px]">
                        {hasRowError ? (
                          <span className="text-red-400 text-xs" title={rowErrors.join("\n")}>●</span>
                        ) : (
                          <span className="text-gray-500">{rowIndex + 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-0 sticky left-10 bg-gray-900/95 z-10 border-r border-white/10">
                      <div className="flex items-center justify-center h-full min-h-[36px]">
                        <button
                          onClick={() => deleteRow(rowIndex)}
                          className="text-red-400/70 hover:text-red-300 text-xs px-1"
                          title="删除此行"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                    {STANDARD_FIELDS.map((f) => {
                      const cellValue = row[f.key] || "";
                      const cellError = rowErrors.find((e) => e.includes(f.label));
                      const isError = !!cellError;
                      const isHovered = hoveredCell?.row === rowIndex && hoveredCell?.field === f.key;
                      const isEditing = editingCell?.row === rowIndex && editingCell?.field === f.key;

                      return (
                        <td
                          key={f.key}
                          className={`p-1 border-r border-white/5 last:border-r-0 relative ${
                            isError ? "bg-red-500/10" : ""
                          } ${!isEditing ? "" : ""}`}
                          onMouseEnter={() => setHoveredCell({ row: rowIndex, field: f.key })}
                          onMouseLeave={() => setHoveredCell(null)}
                          onDoubleClick={() => !isEditing && startEditing(rowIndex, f.key)}
                        >
                          {isError && isHovered && (
                            <div
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 bg-red-600 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none"
                              style={{ maxWidth: "400px" }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>⚠</span>
                                <span>{cellError}</span>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-600" />
                            </div>
                          )}
                          {isEditing ? (
                            f.key === "temperature_level" ? (
                              <select
                                ref={selectRef}
                                value={cellValue}
                                onChange={(e) => updateCell(rowIndex, f.key as keyof PreviewRow, e.target.value)}
                                onBlur={confirmEditing}
                                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, f.key as keyof PreviewRow, cellValue)}
                                className={`w-full bg-gray-800 border rounded-md px-2 py-1.5 outline-none transition-colors text-gray-200 ${
                                  isError
                                    ? "border-red-400"
                                    : "border-indigo-400"
                                }`}
                              >
                                <option value="">— 选择 —</option>
                                {TEMPERATURE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                ref={inputRef}
                                value={cellValue}
                                onChange={(e) => updateCell(rowIndex, f.key as keyof PreviewRow, e.target.value)}
                                onBlur={confirmEditing}
                                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, f.key as keyof PreviewRow, cellValue)}
                                placeholder={f.required ? "必填" : ""}
                                className={`w-full bg-gray-800 border rounded-md px-2 py-1.5 outline-none transition-colors text-gray-200 ${
                                  isError
                                    ? "border-red-400 text-red-200 placeholder-red-400/50"
                                    : "border-indigo-400"
                                }`}
                              />
                            )
                          ) : (
                            <div
                              className={`px-2 py-1.5 min-h-[36px] flex items-center rounded-md transition-colors ${
                                isError
                                  ? "text-red-200"
                                  : "text-gray-200"
                              } ${isHovered ? "bg-white/5" : ""}`}
                            >
                              <span className={`truncate ${!cellValue ? "text-gray-600" : ""}`}>
                                {cellValue || (f.required ? "（必填）" : "-")}
                              </span>
                              {isHovered && (
                                <span className="ml-auto text-gray-600 text-[10px] shrink-0 pl-2">双击编辑</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {currentRows.length === 0 && (
                <tr>
                  <td colSpan={STANDARD_FIELDS.length + 2} className="p-8 text-center text-gray-500 text-sm">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 shrink-0">
        <div className="text-xs text-gray-500">
          {rows.length > 0 && (
            <span>共 {rows.length} 行 · {totalPages} 页 · 错误行 {errorRows.length} 行</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="text-xs text-gray-500 px-1">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
              <span className="text-xs text-gray-500 ml-1">
                跳转
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  className="w-12 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-gray-200 text-center ml-1"
                  value={safePage}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v >= 1 && v <= totalPages) setPage(v);
                  }}
                />
                页
              </span>
            </>
          )}
          {totalPages <= 1 && (
            <button
              onClick={addRow}
              className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              + 新增一行
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
