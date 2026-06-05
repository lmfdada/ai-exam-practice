"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { STANDARD_FIELDS, type StandardFieldKey, validateRow } from "@/lib/orders";

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
  const [pageSize, setPageSize] = useState<number>(50);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / pageSize)), [rows.length, pageSize]);
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, rows.length);
  const currentRows = useMemo(() => rows.slice(pageStart, pageEnd), [rows, pageStart, pageEnd]);

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
        e.preventDefault();
        updateCell(rowIndex, field, value);
        // Tab: 下一个字段；Shift+Tab: 上一个字段
        const fields = STANDARD_FIELDS.map((f) => f.key) as StandardFieldKey[];
        const currentIdx = fields.indexOf(field as StandardFieldKey);
        let nextIdx: number;
        if (e.shiftKey) {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : fields.length - 1;
        } else {
          nextIdx = currentIdx < fields.length - 1 ? currentIdx + 1 : 0;
        }
        setEditingCell({ row: rowIndex, field: fields[nextIdx] });
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
        <div style={{ fontSize: 48, marginBottom: 16, color: allSucceeded ? "var(--ztocc-primary)" : "#f59e0b" }}>
          {allSucceeded ? "✓" : "!"}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ztocc-text-primary)", marginBottom: 16 }}>
          提交完成
        </div>
        <div className="card" style={{ padding: 16, width: "100%", maxWidth: 320, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
            <span style={{ fontSize: 13, color: "var(--ztocc-text-secondary)" }}>提交总数</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ztocc-text-primary)" }}>
              {submitResult.successCount + submitResult.failCount} 条
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--ztocc-border-color-light)" }}>
            <span style={{ fontSize: 13, color: "var(--ztocc-text-secondary)" }}>成功</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ztocc-primary)" }}>
              {submitResult.successCount} 条
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--ztocc-border-color-light)" }}>
            <span style={{ fontSize: 13, color: "var(--ztocc-text-secondary)" }}>失败</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: submitResult.failCount > 0 ? "#ef4444" : "var(--ztocc-text-placeholder)" }}>
              {submitResult.failCount} 条
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--ztocc-border-color-light)" }}>
            <span style={{ fontSize: 13, color: "var(--ztocc-text-secondary)" }}>批次号</span>
            <span style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)", fontFamily: "monospace" }}>
              {submitResult.batchId}
            </span>
          </div>
        </div>
        {submitResult.errors.length > 0 && (
          <div style={{ width: "100%", maxWidth: 320, marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8, fontWeight: 500 }}>
              失败详情（{submitResult.errors.length} 条）：
            </div>
            <div style={{
              padding: 12,
              background: "var(--danger-bg)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "var(--ztocc-border-radius-base)",
              fontSize: 12,
              color: "#dc2626",
              maxHeight: 128,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              {submitResult.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          {allSucceeded ? (
            <button onClick={onBack} className="btn btn-primary">
              ↩ 继续导入
            </button>
          ) : (
            <button
              onClick={() => setSubmitResult(null)}
              className="btn btn-secondary"
              style={{ borderColor: "var(--ztocc-primary)", color: "var(--ztocc-primary)" }}
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ztocc-text-primary)" }}>数据预览与编辑</div>
          <div style={{ fontSize: 12, color: "var(--ztocc-text-secondary)", marginTop: 4 }}>
            {rows.length > pageSize
              ? `共 ${rows.length} 行，显示第 ${pageStart + 1}-${pageEnd} 行`
              : `共 ${rows.length} 行`}
            {rows.length > 500 && (
              <span style={{ color: "#d97706", marginLeft: 8 }}>⚠ 批量数据</span>
            )}
            {hasErrors ? (
              <span style={{ color: "#ef4444", marginLeft: 8, fontWeight: 500 }}>
                ✗ {totalErrors} 个错误待修复
              </span>
            ) : rows.length > 0 ? (
              <span style={{ color: "var(--ztocc-primary)", marginLeft: 8 }}>✓ 全部校验通过</span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onBack} className="btn btn-sm btn-ghost">↩ 返回</button>
          <button onClick={addRow} className="btn btn-sm" style={{ background: "var(--ztocc-primary-bg)", color: "var(--ztocc-primary)" }}>+ 新增行</button>
          <button onClick={handleExport} className="btn btn-sm" style={{ background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>导出</button>
        </div>
      </div>

      {/* 底部提交栏 */}
      {rows.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--ztocc-bg-card)",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ztocc-text-secondary)" }}>
            {rows.length} 条数据
            {totalErrors > 0 && (
              <span style={{ color: "#f56c6c", marginLeft: 8 }}>
                · {totalErrors} 条待修正
              </span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={hasErrors || submitting}
            style={{
              padding: "10px 40px",
              fontSize: 15,
              fontWeight: 600,
              background: hasErrors || submitting
                ? "rgba(156, 163, 175, 0.15)"
                : "linear-gradient(135deg, #0fc6c2, #0da8a4)",
              color: hasErrors || submitting ? "#9ca3af" : "#fff",
              border: "none",
              borderRadius: 6,
              cursor: hasErrors || submitting ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              boxShadow: hasErrors || submitting ? "none" : "0 2px 8px rgba(15, 198, 194, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 160,
              justifyContent: "center",
            }}
          >
            {submitting ? (
              <>
                <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                提交中 {submitProgress ? `${Math.round((submitProgress.completed / submitProgress.total) * 100)}%` : "..."}
              </>
            ) : (
              <>
                <span style={{ fontSize: 18 }}>📤</span>
                提交下单
              </>
            )}
          </button>
        </div>
      )}

      {/* 提交进度 */}
      {submitting && submitProgress && (
        <div style={{
          marginBottom: 16,
          padding: 16,
          background: "var(--ztocc-primary-bg)",
          border: "1px solid var(--ztocc-primary)",
          borderRadius: "var(--ztocc-border-radius)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--ztocc-primary)", fontWeight: 500 }}>
              正在提交数据
              {submitProgress.total > 1 && `（第 ${submitProgress.currentBatch}/${submitProgress.total} 批）`}
            </span>
            <span style={{ color: "var(--ztocc-text-secondary)" }}>
              {Math.round((submitProgress.completed / submitProgress.total) * 100)}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${(submitProgress.completed / submitProgress.total) * 100}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ztocc-text-placeholder)", marginTop: 4 }}>
            <span>共 {rows.length} 条数据</span>
            <span>每批 {SUBMIT_BATCH_SIZE} 条 · 共 {submitProgress.total} 批</span>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {hasErrors && !submitting && (
        <div style={{
          marginBottom: 16,
          background: "var(--danger-bg)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "var(--ztocc-border-radius)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(239, 68, 68, 0.1)" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#ef4444" }}>
              发现 {totalErrors} 个错误，涉及 {errorRows.length} 行
            </div>
            <div style={{ fontSize: 12, color: "rgba(239, 68, 68, 0.7)", marginTop: 2 }}>
              请修正所有错误后再提交
            </div>
          </div>
          <div style={{ maxHeight: 192, overflowY: "auto" }}>
            {errorListItems.map((item) => (
              <div key={item.key} style={{
                padding: "4px 12px",
                fontSize: 12,
                color: "#b91c1c",
                borderBottom: "1px solid rgba(239, 68, 68, 0.05)",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}>
                <span style={{ color: "#ef4444", flexShrink: 0 }}>●</span>
                <span>{item.text}</span>
              </div>
            ))}
            {hasMoreErrors && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--ztocc-text-placeholder)", textAlign: "center" }}>
                ... 仅显示前 100 条错误
              </div>
            )}
          </div>
        </div>
      )}

      {/* 表格区域 */}
      <div style={{
        border: "1px solid var(--ztocc-table-border)",
        overflow: "hidden",
        flex: 1,
        minHeight: 0,
      }}>
        <div
          style={{ height: "100%", overflow: "auto" }}
          ref={scrollRef}
          onScroll={useVirtual ? (e) => setScrollTop((e.target as HTMLDivElement).scrollTop) : undefined}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
              <tr>
                <th style={{
                  padding: "8px 6px",
                  textAlign: "center",
                  color: "var(--ztocc-table-header-text)",
                  fontWeight: 700,
                  width: 36,
                  position: "sticky",
                  left: 0,
                  zIndex: 30,
                  borderRight: "1px solid var(--ztocc-table-border)",
                  background: "var(--ztocc-table-header-bg)",
                  borderBottom: "1px solid var(--ztocc-table-border)",
                }}>
                  #
                </th>
                <th style={{
                  padding: "8px 6px",
                  textAlign: "center",
                  color: "var(--ztocc-table-header-text)",
                  fontWeight: 700,
                  width: 40,
                  position: "sticky",
                  left: 36,
                  zIndex: 30,
                  borderRight: "1px solid var(--ztocc-table-border)",
                  background: "var(--ztocc-table-header-bg)",
                  borderBottom: "1px solid var(--ztocc-table-border)",
                }}>
                  操作
                </th>
                <th style={{
                  padding: "8px 6px",
                  textAlign: "center",
                  color: "var(--ztocc-table-header-text)",
                  fontWeight: 700,
                  width: 60,
                  position: "sticky",
                  left: 76,
                  zIndex: 30,
                  borderRight: "1px solid var(--ztocc-table-border)",
                  background: "var(--ztocc-table-header-bg)",
                  borderBottom: "1px solid var(--ztocc-table-border)",
                }}>
                  模式
                </th>
                {STANDARD_FIELDS.map((f) => (
                  <th key={f.key} style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    color: "var(--ztocc-table-header-text)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    minWidth: 120,
                    borderRight: "1px solid var(--ztocc-table-border)",
                    borderBottom: "1px solid var(--ztocc-table-border)",
                  }}>
                    {f.label}
                    {f.required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
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
                  <td colSpan={STANDARD_FIELDS.length + 3} style={{ padding: 32, textAlign: "center", color: "var(--ztocc-text-placeholder)", fontSize: 13 }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)" }}>
          {rows.length > 0 && (
            <span>共 {rows.length} 行 · {totalPages} 页 · 错误行 {errorRows.length} 行</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="input"
            style={{ fontSize: 12, padding: "2px 6px", width: "auto" }}
          >
            <option value={10}>10 条/页</option>
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
            <option value={100}>100 条/页</option>
          </select>
          {totalPages > 1 && !useVirtual && (
            <>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="btn btn-sm btn-ghost"
                style={{ opacity: safePage <= 1 ? 0.3 : 1, cursor: safePage <= 1 ? "not-allowed" : "pointer" }}
              >
                ←
              </button>
              <span style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)", padding: "0 4px" }}>
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="btn btn-sm btn-ghost"
                style={{ opacity: safePage >= totalPages ? 0.3 : 1, cursor: safePage >= totalPages ? "not-allowed" : "pointer" }}
              >
                →
              </button>
              <span style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)", marginLeft: 4 }}>
                跳转
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  className="input"
                  style={{ width: 48, padding: "2px 6px", textAlign: "center", marginLeft: 4, fontSize: 12 }}
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
            <button onClick={addRow} className="btn btn-sm btn-ghost">+ 新增一行</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 行渲染子组件 =====
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
  const groupColor = group === "group_a" ? "var(--ztocc-primary)" : group === "group_b" ? "#f59e0b" : "var(--ztocc-text-placeholder)";

  return (
    <tr style={{
      borderTop: "1px solid var(--ztocc-table-border)",
      background: hasRowError ? "var(--danger-bg)" : undefined,
    }}>
      {/* 行号 */}
      <td style={{
        padding: 0,
        position: "sticky",
        left: 0,
        zIndex: 10,
        borderRight: "1px solid var(--ztocc-table-border)",
        background: hasRowError ? "var(--danger-bg)" : "var(--ztocc-bg-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
          {hasRowError ? (
            <span style={{ color: "#ef4444", fontSize: 12 }} title={rowErrors.join("\n")}>●</span>
          ) : (
            <span style={{ color: "var(--ztocc-text-placeholder)" }}>{rowIndex + 1}</span>
          )}
        </div>
      </td>
      {/* 操作 */}
      <td style={{
        padding: 0,
        position: "sticky",
        left: 36,
        zIndex: 10,
        borderRight: "1px solid var(--ztocc-table-border)",
        background: hasRowError ? "var(--danger-bg)" : "var(--ztocc-bg-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
          <button
            onClick={() => deleteRow(rowIndex)}
            style={{ color: "rgba(239, 68, 68, 0.7)", fontSize: 12, padding: "0 4px", background: "none", border: "none", cursor: "pointer" }}
            title="删除此行"
          >
            ✕
          </button>
        </div>
      </td>
      {/* A/B 组标记 */}
      <td style={{
        padding: 0,
        position: "sticky",
        left: 76,
        zIndex: 10,
        borderRight: "1px solid var(--ztocc-table-border)",
        background: hasRowError ? "var(--danger-bg)" : "var(--ztocc-bg-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 3,
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
            style={{
              padding: 4,
              borderRight: "1px solid var(--ztocc-table-border)",
              position: "relative",
              background: isError ? "var(--danger-bg)" : undefined,
            }}
            onMouseEnter={() => setHoveredCell({ row: rowIndex, field: f.key })}
            onMouseLeave={() => setHoveredCell(null)}
            onDoubleClick={() => !isEditing && startEditing(rowIndex, f.key)}
          >
            {isError && isHovered && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                marginBottom: 4,
                padding: "4px 10px",
                background: "#dc2626",
                color: "#fff",
                fontSize: 11,
                borderRadius: 6,
                whiteSpace: "nowrap",
                zIndex: 50,
                pointerEvents: "none",
                maxWidth: 400,
              }}>
                <span>! {cellError}</span>
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "4px solid #dc2626",
                }} />
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
                className="input"
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: 12,
                  borderColor: isError ? "#ef4444" : "var(--ztocc-primary)",
                }}
              />
            ) : (
              <div style={{
                padding: "4px 8px",
                minHeight: 36,
                display: "flex",
                alignItems: "center",
                borderRadius: 4,
                background: isHovered ? "var(--ztocc-table-row-hover)" : undefined,
                cursor: "pointer",
              }}>
                <span style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: cellValue ? "var(--ztocc-text-primary)" : "var(--ztocc-text-placeholder)",
                }}>
                  {cellValue || (f.required ? "（必填）" : "-")}
                </span>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}
