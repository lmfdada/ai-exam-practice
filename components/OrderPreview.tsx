"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { STANDARD_FIELDS, validateRow } from "@/lib/orders";

interface PreviewRow {
  [key: string]: string;
  external_code: string;
  receiver_store: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  sku_code: string;
  sku_name: string;
  sku_qty: string;
  sku_spec: string;
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
  onSubmitSuccess?: () => void;
}

const PAGE_SIZE = 50;
const SUBMIT_BATCH_SIZE = 200;
const VIRTUAL_THRESHOLD = 500;
const ROW_HEIGHT = 42;

function emptyRow(): PreviewRow {
  return {
    external_code: "",
    receiver_store: "",
    receiver_name: "",
    receiver_phone: "",
    receiver_address: "",
    sku_code: "",
    sku_name: "",
    sku_qty: "",
    sku_spec: "",
    remark: "",
  };
}

function getFieldLabel(key: string): string {
  const field = STANDARD_FIELDS.find((f) => f.key === key);
  return field ? field.label : key;
}

/** 判断行的收货模式 */
function getRowGroup(row: PreviewRow): "group_a" | "group_b" | "none" {
  const hasA = !!row.receiver_store?.trim();
  const hasB = !!(row.receiver_name?.trim() || row.receiver_phone?.trim() || row.receiver_address?.trim());
  if (hasA) return "group_a";
  if (hasB) return "group_b";
  return "none";
}

export default function OrderPreview({ data, onBack, onSubmitSuccess }: Props) {
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

  // 虚拟滚动
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const useVirtual = rows.length > VIRTUAL_THRESHOLD;

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

  // 虚拟滚动计算
  const visibleCount = useMemo(() => Math.ceil((scrollRef.current?.clientHeight || 600) / ROW_HEIGHT) + 4, [scrollRef.current?.clientHeight]);
  const virtualStart = useMemo(() => {
    if (!useVirtual) return 0;
    return Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  }, [useVirtual, scrollTop, ROW_HEIGHT]);
  const virtualEnd = useMemo(() => {
    if (!useVirtual) return 0;
    return Math.min(rows.length, virtualStart + visibleCount);
  }, [useVirtual, virtualStart, visibleCount, rows.length]);
  const virtualRows = useMemo(() => {
    if (!useVirtual) return [];
    return rows.slice(virtualStart, virtualEnd);
  }, [useVirtual, virtualStart, virtualEnd, rows]);

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
    (rowIndex: number, field: string, value: string) => {
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
    (e: React.KeyboardEvent, rowIndex: number, field: string, value: string) => {
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
    if (!res.ok) return;
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
          totalSuccess += result.data.insertedCount || 0;
          totalFail += result.data.failedCount || 0;
          if (result.data.failed?.length > 0) {
            for (const f of result.data.failed) {
              if (f.errors) allErrors.push(...f.errors);
              else if (f.error) allErrors.push(f.error);
            }
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
      onSubmitSuccess?.();
    }
  }, [rows, hasErrors, onSubmitSuccess]);

  if (submitResult) {
    const allSucceeded = submitResult.failCount === 0;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className={`text-5xl mb-4 ${allSucceeded ? "text-[var(--primary)]" : "text-amber-400"}`}>
          {allSucceeded ? "✓" : "!"}
        </div>
        <h3 className="text-lg font-semibold text-white mb-4">提交完成</h3>
        <div className="card p-4 w-full max-w-sm mb-6" style={{ background: "var(--bg-card)" }}>
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm text-gray-400">提交总数</span>
            <span className="text-sm text-white font-medium">{submitResult.successCount + submitResult.failCount} 条</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-t border-white/5">
            <span className="text-sm text-gray-400">成功</span>
            <span className="text-sm text-[var(--primary)] font-medium">{submitResult.successCount} 条</span>
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
              className="btn btn-primary"
            >
              ↩ 继续导入
            </button>
          ) : (
            <button
              onClick={() => setSubmitResult(null)}
              className="btn btn-secondary"
              style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
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
          <h3 className="text-sm font-medium text-white">数据预览与编辑</h3>
          <p className="text-xs text-gray-400 mt-1">
            {rows.length > PAGE_SIZE
              ? `共 ${rows.length} 行，显示第 ${pageStart + 1}-${pageEnd} 行`
              : `共 ${rows.length} 行`}
            {rows.length > 500 && (
              <span className="text-amber-400 ml-2">⚠ 批量数据</span>
            )}
            {hasErrors ? (
              <span className="text-red-400 ml-2 font-medium">
                ✗ {totalErrors} 个错误待修复
              </span>
            ) : rows.length > 0 ? (
              <span className="text-[var(--primary)] ml-2">✓ 全部校验通过</span>
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
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--primary-bg)", color: "var(--primary)" }}
          >
            + 新增行
          </button>
          <button
            onClick={handleExport}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            导出
          </button>
          <button
            onClick={handleSubmit}
            disabled={hasErrors || submitting}
            className={`text-xs px-4 py-1.5 rounded-lg transition-colors ${
              hasErrors || submitting
                ? "bg-gray-500/20 text-gray-500 cursor-not-allowed"
                : ""
            }`}
            style={
              !hasErrors && !submitting
                ? { background: "var(--primary-bg)", color: "var(--primary)" }
                : undefined
            }
          >
            {submitting
              ? `提交中 ${submitProgress ? `${Math.round((submitProgress.completed / submitProgress.total) * 100)}%` : "..."}`
              : "提交下单"}
          </button>
        </div>
      </div>

      {submitting && submitProgress && (
        <div className="mb-4 p-4" style={{
          background: "var(--primary-bg)",
          border: "1px solid",
          borderColor: "var(--primary)",
          borderRadius: "var(--radius)",
          opacity: 0.8,
        }}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span style={{ color: "var(--primary)", fontWeight: 500 }}>
              正在提交数据
              {submitProgress.total > 1 && `（第 ${submitProgress.currentBatch}/${submitProgress.total} 批）`}
            </span>
            <span className="text-gray-400 tabular-nums">
              {Math.round((submitProgress.completed / submitProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(submitProgress.completed / submitProgress.total) * 100}%`,
                background: "linear-gradient(90deg, var(--primary), var(--primary-dark))",
              }}
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
            {errorListItems.map((item) => (
                <div
                  key={item.key}
                  className="px-3 py-1.5 text-xs text-red-300 border-b border-red-500/5 hover:bg-red-500/10 transition-colors flex items-start gap-2"
                >
                  <span className="text-red-500 mt-0.5 shrink-0">●</span>
                  <span>{item.text}</span>
                </div>
              ))}
            {hasMoreErrors && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                ... 仅显示前 100 条错误
              </div>
            )}
          </div>
        </div>
      )}

      {/* 表格区域 */}
      <div
        className="border border-white/10 rounded-xl overflow-hidden flex-1 min-h-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div
          className="h-full overflow-auto"
          ref={scrollRef}
          onScroll={useVirtual ? (e) => setScrollTop((e.target as HTMLDivElement).scrollTop) : undefined}
        >
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20">
              <tr style={{ background: "var(--bg-card)" }}>
                <th className="p-2 text-center text-gray-400 font-medium w-9 sticky left-0 z-30 border-r border-white/10"
                    style={{ background: "var(--bg-card)" }}>
                  #
                </th>
                <th className="p-2 text-center text-gray-400 font-medium w-10 sticky left-9 z-30 border-r border-white/10"
                    style={{ background: "var(--bg-card)" }}>
                  操作
                </th>
                <th className="p-2 text-center text-gray-400 font-medium w-16 sticky left-[76px] z-30 border-r border-white/10"
                    style={{ background: "var(--bg-card)" }}>
                  模式
                </th>
                {STANDARD_FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="p-2 text-left text-gray-300 font-medium whitespace-nowrap min-w-[120px] border-r border-white/5 last:border-r-0"
                  >
                    {f.label}
                    {f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {useVirtual ? (
                <>
                  <tr><td colSpan={STANDARD_FIELDS.length + 3} style={{ height: virtualStart * ROW_HEIGHT }} /></tr>
                  {virtualRows.map((row, vi) => {
                    const rowIndex = virtualStart + vi;
                    const rowErrors = allErrors[rowIndex] || [];
                    const hasRowError = rowErrors.length > 0;
                    const group = getRowGroup(row);

                    return (
                      <RowComp
                        key={rowIndex}
                        row={row}
                        rowIndex={rowIndex}
                        rowErrors={rowErrors}
                        hasRowError={hasRowError}
                        group={group}
                        hoveredCell={hoveredCell}
                        editingCell={editingCell}
                        setHoveredCell={setHoveredCell}
                        updateCell={updateCell}
                        deleteRow={deleteRow}
                        startEditing={startEditing}
                        confirmEditing={confirmEditing}
                        handleCellKeyDown={handleCellKeyDown}
                        inputRef={inputRef}
                        selectRef={selectRef}
                      />
                    );
                  })}
                  <tr><td colSpan={STANDARD_FIELDS.length + 3} style={{ height: (rows.length - virtualEnd) * ROW_HEIGHT }} /></tr>
                </>
              ) : (
                currentRows.map((row, pi) => {
                  const rowIndex = pageStart + pi;
                  const rowErrors = allErrors[rowIndex] || [];
                  const hasRowError = rowErrors.length > 0;
                  const group = getRowGroup(row);

                  return (
                    <RowComp
                      key={rowIndex}
                      row={row}
                      rowIndex={rowIndex}
                      rowErrors={rowErrors}
                      hasRowError={hasRowError}
                      group={group}
                      hoveredCell={hoveredCell}
                      editingCell={editingCell}
                      setHoveredCell={setHoveredCell}
                      updateCell={updateCell}
                      deleteRow={deleteRow}
                      startEditing={startEditing}
                      confirmEditing={confirmEditing}
                      handleCellKeyDown={handleCellKeyDown}
                      inputRef={inputRef}
                      selectRef={selectRef}
                    />
                  );
                })
              )}
              {currentRows.length === 0 && !useVirtual && (
                <tr>
                  <td colSpan={STANDARD_FIELDS.length + 3} className="p-8 text-center text-gray-500 text-sm">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between mt-4 shrink-0">
        <div className="text-xs text-gray-500">
          {rows.length > 0 && (
            <span>共 {rows.length} 行 · {totalPages} 页 · 错误行 {errorRows.length} 行</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && !useVirtual && (
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
          {totalPages <= 1 && !useVirtual && (
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

// ===== 行渲染子组件（减少重复代码） =====
interface RowCompProps {
  row: PreviewRow;
  rowIndex: number;
  rowErrors: string[];
  hasRowError: boolean;
  group: "group_a" | "group_b" | "none";
  hoveredCell: { row: number; field: string } | null;
  editingCell: { row: number; field: string } | null;
  setHoveredCell: (v: { row: number; field: string } | null) => void;
  updateCell: (rowIndex: number, field: string, value: string) => void;
  deleteRow: (index: number) => void;
  startEditing: (rowIndex: number, field: string) => void;
  confirmEditing: () => void;
  handleCellKeyDown: (e: React.KeyboardEvent, rowIndex: number, field: string, value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectRef: React.RefObject<HTMLSelectElement | null>;
}

function RowComp({
  row, rowIndex, rowErrors, hasRowError, group,
  hoveredCell, editingCell, setHoveredCell,
  updateCell, deleteRow, startEditing, confirmEditing,
  handleCellKeyDown, inputRef, selectRef,
}: RowCompProps) {
  const groupLabel = group === "group_a" ? "A组" : group === "group_b" ? "B组" : "-";
  const groupColor = group === "group_a" ? "var(--primary)" : group === "group_b" ? "#f59e0b" : "var(--text-muted)";

  return (
    <tr
      className={`border-t border-white/5 transition-colors ${
        hasRowError ? "bg-red-500/5" : "hover:bg-white/5"
      }`}
    >
      {/* 行号 */}
      <td className="p-0 sticky left-0 z-10 border-r border-white/10"
          style={{ background: hasRowError ? "rgba(239,68,68,0.05)" : "var(--bg-dark)" }}>
        <div className="flex items-center justify-center h-full min-h-[36px]">
          {hasRowError ? (
            <span className="text-red-400 text-xs" title={rowErrors.join("\n")}>●</span>
          ) : (
            <span className="text-gray-500">{rowIndex + 1}</span>
          )}
        </div>
      </td>
      {/* 操作 */}
      <td className="p-0 sticky left-9 z-10 border-r border-white/10"
          style={{ background: hasRowError ? "rgba(239,68,68,0.05)" : "var(--bg-dark)" }}>
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
      {/* A/B 组标记 */}
      <td className="p-0 sticky left-[76px] z-10 border-r border-white/10"
          style={{ background: hasRowError ? "rgba(239,68,68,0.05)" : "var(--bg-dark)" }}>
        <div className="flex items-center justify-center h-full min-h-[36px]">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  color: groupColor,
                  border: `1px solid ${groupColor}`,
                  opacity: group === "none" ? 0.3 : 0.8,
                }}>
            {groupLabel}
          </span>
        </div>
      </td>
      {/* 标准字段列 */}
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
            }`}
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
                  <span>!</span>
                  <span>{cellError}</span>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-600" />
              </div>
            )}
            {isEditing ? (
              <input
                ref={inputRef}
                value={cellValue}
                onChange={(e) => updateCell(rowIndex, f.key, e.target.value)}
                onBlur={confirmEditing}
                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, f.key, cellValue)}
                placeholder={f.required ? "必填" : ""}
                className={`w-full bg-gray-800 border rounded-md px-2 py-1.5 outline-none transition-colors text-gray-200 ${
                  isError ? "border-red-400 text-red-200 placeholder-red-400/50" : ""
                }`}
                style={!isError ? { borderColor: "var(--primary)" } : undefined}
              />
            ) : (
              <div
                className={`px-2 py-1.5 min-h-[36px] flex items-center rounded-md transition-colors ${
                  isError ? "text-red-200" : "text-gray-200"
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
}
