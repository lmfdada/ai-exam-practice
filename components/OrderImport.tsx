"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import type { ImportData } from "@/app/page";
import RuleEditor from "./RuleEditor";
import type { ParseRule } from "@/lib/rules";

interface Props {
  onImportComplete: (data: ImportData) => void;
}

interface Rule {
  id: string;
  name: string;
  description: string;
  fileTypes: string[];
  usedCount: number;
  isAiGenerated?: boolean;
}

type Step = "upload" | "mapping";

export default function OrderImport({ onImportComplete }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [parseResult, setParseResult] = useState<ImportData | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<ParseRule> | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const [showRuleSelector, setShowRuleSelector] = useState(false);
  const [rawPreviewHeaders, setRawPreviewHeaders] = useState<string[]>([]);
  const [rawPreviewRows, setRawPreviewRows] = useState<string[][]>([]);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== 加载规则列表 =====
  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rules");
      const json = await res.json();
      if (json.success) {
        setRules(json.data || []);
      }
    } catch {
      setError("加载规则列表失败");
    }
    setRulesLoading(false);
  }, []);

  // 页面加载时自动加载规则列表
  useEffect(() => {
    let cancelled = false;
    fetch("/api/rules")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setRules(json.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("加载规则列表失败");
      })
      .finally(() => {
        if (!cancelled) setRulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== 编辑规则 =====
  const handleEditRule = (e: React.MouseEvent, rule: Rule) => {
    e.stopPropagation();
    setEditingRule({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      fileTypes: rule.fileTypes as ("xlsx" | "xls" | "docx" | "pdf")[],
    });
    setShowRuleEditor(true);
  };

  // ===== 删除规则 =====
  const handleDeleteRule = async (e: React.MouseEvent, ruleId: string) => {
    e.stopPropagation();
    if (!confirm(`确认删除规则「${rules.find(r => r.id === ruleId)?.name}」？`)) return;

    try {
      const res = await fetch(`/api/rules?ruleId=${ruleId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
        if (selectedRule?.id === ruleId) setSelectedRule(null);
      } else {
        setError(json.message || "删除失败");
      }
    } catch {
      setError("删除规则失败");
    }
  };

  // ===== 复制规则 =====
  const handleCopyRule = async (e: React.MouseEvent, rule: Rule) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/rules?ruleId=${rule.id}`);
      const json = await res.json();
      if (!json.success || !json.data) {
        setError("获取规则详情失败");
        return;
      }

      const ruleData = json.data;
      const copyRes = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${rule.name} (副本)`,
          description: rule.description,
          fileTypes: rule.fileTypes,
          config: ruleData.config || {},
        }),
      });
      const copyJson = await copyRes.json();
      if (copyJson.success) {
        await loadRules();
      } else {
        setError(copyJson.message || "复制失败");
      }
    } catch {
      setError("复制规则失败");
    }
  };

  // ===== 规则保存回调 =====
  const handleRuleSaved = (savedRule: ParseRule) => {
    setShowRuleEditor(false);
    setEditingRule(undefined);
    loadRules();
    setSelectedRule({
      id: savedRule.id,
      name: savedRule.name,
      description: savedRule.description,
      fileTypes: savedRule.fileTypes as string[],
      usedCount: 0,
      isAiGenerated: !!(savedRule as unknown as Record<string, unknown>).isAiGenerated,
    });
  };

  // ===== 上传并解析 =====
  const doParse = useCallback(async (rule: Rule | null) => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    if (rule) {
      formData.append("rule", JSON.stringify(rule));
    }

    try {
      const xhr = new XMLHttpRequest();

      const result = await new Promise<ImportData>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 90));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              if (json.success) {
                const d = json.data;
                resolve({
                  headers: d.headers || [],
                  rows: d.rows || [],
                  rowCount: d.rowCount || 0,
                  mapping: d.mapping || {},
                  fingerprint: d.fingerprint || "",
                  method: rule ? "rule" : "auto",
                  ruleName: rule?.name,
                });
              } else {
                reject(new Error(json.message || "解析失败"));
              }
            } catch {
              reject(new Error("响应格式错误"));
            }
          } else {
            reject(new Error(`上传失败 (${xhr.status})`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("网络错误")));
        xhr.addEventListener("abort", () => reject(new Error("上传已取消")));

        xhr.open("POST", "/api/orders/import");
        xhr.send(formData);
      });

      setUploadProgress(100);
      setParseResult(result);
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    }

    setUploading(false);
  }, [file]);

  // ===== 文件选中后，先做一次无规则预览 =====
  const doRawPreview = useCallback(async (f: File) => {
    setRawPreviewHeaders([]);
    setRawPreviewRows([]);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/orders/import", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        setRawPreviewHeaders(json.data?.headers || []);
        setRawPreviewRows((json.data?.rows || []).slice(0, 5));
      }
    } catch {
      // 预览失败不影响整体流程
    }
  }, []);

  // ===== 文件变更 =====
  const handleFileSelected = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!["xlsx", "xls", "pdf", "docx", "csv"].includes(ext)) {
      setError("不支持的文件格式，请上传 .xlsx .xls .pdf .docx .csv 文件");
      return;
    }
    setFile(f);
    setError("");
    setSelectedRule(null);
    setShowRuleSelector(true);
    doRawPreview(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
  };

  // ===== 选择已有规则 =====
  const handleSelectRule = async (rule: Rule) => {
    // 先获取完整规则（含 config）
    try {
      const res = await fetch(`/api/rules?ruleId=${encodeURIComponent(rule.id)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSelectedRule(json.data);
        setShowRuleSelector(false);
        doParse(json.data);
        return;
      }
    } catch {
      // 获取失败则回退到使用简化版规则
    }
    setSelectedRule(rule);
    setShowRuleSelector(false);
    doParse(rule);
  };

  // ===== AI 生成规则 =====
  const handleAIGenerate = async () => {
    if (!file) return;
    setGenerating(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/rules/generate", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (json.success && json.data) {
        const aiRuleData = json.data;
        // 打开 RuleEditor 预填充 AI 规则
        setEditingRule({
          name: aiRuleData.name || file.name.replace(/\.[^.]+$/, ""),
          description: aiRuleData.description || `AI 为「${file.name}」自动生成`,
          fileTypes: aiRuleData.fileTypes || ["xlsx"],
          config: aiRuleData.config,
          isAiGenerated: true,
        } as Partial<ParseRule>);
        setShowRuleEditor(true);
      } else {
        // AI 失败时，至少打开一个带有文件提示的空编辑器
        setEditingRule({
          name: file.name.replace(/\.[^.]+$/, ""),
          description: `适用于 ${file.name}`,
          fileTypes: [file.name.split(".").pop() || "xlsx"] as ("xlsx" | "xls" | "docx" | "pdf")[],
          config: { sheets: "auto", headerDetection: "auto", columns: [], steps: [] },
        } as Partial<ParseRule>);
        setShowRuleEditor(true);
      }
    } catch {
      setEditingRule({
        name: file.name.replace(/\.[^.]+$/, ""),
        description: `适用于 ${file.name}`,
        fileTypes: [file.name.split(".").pop() || "xlsx"] as ("xlsx" | "xls" | "docx" | "pdf")[],
        config: { sheets: "auto", headerDetection: "auto", columns: [], steps: [] },
      } as Partial<ParseRule>);
      setShowRuleEditor(true);
    }

    setGenerating(false);
  };

  // ===== 自动解析（无规则） =====
  const handleAutoParse = () => {
    setSelectedRule(null);
    setShowRuleSelector(false);
    doParse(null);
  };

  // ===== 确认映射并完成导入 =====
  const handleConfirmMapping = () => {
    if (parseResult) {
      onImportComplete(parseResult);
    }
  };

  // ===== 修改映射 =====
  const handleMappingChange = (header: string, field: string) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      mapping: { ...parseResult.mapping, [header]: field },
    });
  };

  // ===== 重新选择文件 =====
  const handleResetFile = () => {
    setFile(null);
    setShowRuleSelector(false);
    setSelectedRule(null);
    setRawPreviewHeaders([]);
    setRawPreviewRows([]);
    setError("");
    setParseResult(null);
    setUploading(false);
    setStep("upload");
  };

  // ===== 渲染：上传步骤（入口） =====
  const renderUploadStep = () => (
    <div style={{ padding: 40 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          上传文件
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          上传出库单文件，然后选择解析规则或自动解析
        </div>
      </div>

      {/* 文件上传区域 */}
      {!file && (
        <div
          className="card"
          style={{
            padding: 48,
            textAlign: "center",
            borderStyle: "dashed",
            cursor: "pointer",
            borderColor: dragOver ? "var(--ztocc-primary)" : "var(--border-color)",
            background: dragOver ? "rgba(0,185,185,0.04)" : "var(--bg-card)",
            transition: "all 0.2s",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            const droppedFiles = e.dataTransfer.files;
            if (droppedFiles.length > 0) {
              handleFileSelected(droppedFiles[0]);
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.pdf,.docx,.csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <div>
            <div style={{ fontSize: 40, marginBottom: 8, opacity: dragOver ? 1 : 0.4 }}>
              {dragOver ? "📥" : "📂"}
            </div>
            <div style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 4 }}>
              {dragOver ? "松开以上传文件" : "拖拽文件到此处或点击上传"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              支持 .xlsx .xls .pdf .docx .csv 格式
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open("/api/templates?download=true", "_blank");
                }}
                style={{ fontSize: 12 }}
              >
                下载标准模板
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已选择文件 */}
      {file && (
        <>
          {/* 文件信息 */}
          <div className="card" style={{
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderLeft: "3px solid var(--primary)",
          }}>
            <span style={{ fontSize: 28 }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                {file.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop()?.toUpperCase()}
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={handleResetFile}>
              重新选择
            </button>
          </div>

          {/* 原始数据预览 */}
          {rawPreviewHeaders.length > 0 && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>
                文件数据预览（前 5 行）
              </div>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--ztocc-table-border)", borderRadius: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {rawPreviewHeaders.map((h, i) => (
                        <th key={i} style={{
                          padding: "6px 10px",
                          background: "#fafafa",
                          fontWeight: 600,
                          borderBottom: "1px solid var(--ztocc-table-border)",
                          whiteSpace: "nowrap",
                          textAlign: "left",
                          fontSize: 12,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawPreviewRows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{
                            padding: "4px 10px",
                            borderBottom: "1px solid #f0f0f0",
                            whiteSpace: "nowrap",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>{cell || "-"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 规则选择区域 */}
          {showRuleSelector && !uploading && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
                选择解析方式
              </div>

              {/* 已有规则列表 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                    已有解析规则
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={loadRules} style={{ fontSize: 12 }}>
                      刷新
                    </button>
                  </div>
                </div>

                {rulesLoading ? (
                  <div style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    加载中...
                  </div>
                ) : rules.length === 0 ? (
                  <div style={{
                    padding: 16,
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    border: "1px dashed var(--border-color)",
                    borderRadius: 6,
                  }}>
                    暂无保存的规则
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflow: "auto" }}>
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="card"
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          border: selectedRule?.id === rule.id
                            ? "1px solid var(--primary)"
                            : "1px solid var(--border-color)",
                        }}
                        onClick={() => handleSelectRule(rule)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                            {rule.name}
                            {rule.isAiGenerated && (
                              <span className="tag tag-cyan" style={{ marginLeft: 6, fontSize: 10 }}>AI</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            {rule.description || rule.fileTypes.join(", ")}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button className="btn btn-sm btn-ghost" onClick={(e) => handleEditRule(e, rule)} style={{ fontSize: 11, padding: "2px 6px" }}>
                            编辑
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={(e) => handleCopyRule(e, rule)} style={{ fontSize: 11, padding: "2px 6px" }}>
                            复制
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={(e) => handleDeleteRule(e, rule.id)} style={{ fontSize: 11, padding: "2px 6px" }}>
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleAIGenerate}
                  disabled={generating}
                  style={{ flex: 1, height: 36 }}
                >
                  {generating ? "AI 分析中..." : "AI 新建规则"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleAutoParse}
                  style={{ flex: 1, height: 36 }}
                >
                  自动解析（无规则）
                </button>
              </div>
            </div>
          )}

          {/* 进度条 */}
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>
                解析中 {uploadProgress}%
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              fontSize: 13,
              color: "#dc2626",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>解析失败</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>文件：</span>
                  {file?.name || "-"}（{(file ? (file.size / 1024).toFixed(1) : "-")} KB）
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>格式：</span>
                  {file?.name?.split(".").pop()?.toUpperCase() || "-"}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>原因：</span>
                  {error}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setError("");
                    if (file) {
                      setEditingRule({
                        name: file.name.replace(/\.[^.]+$/, ""),
                        description: `适用于 ${file.name}`,
                        fileTypes: [file.name.split(".").pop() || "xlsx"] as ("xlsx" | "xls" | "docx" | "pdf")[],
                        config: { sheets: "auto" as const, headerDetection: "auto" as const, columns: [], steps: [] },
                        isAiGenerated: false,
                      } as Partial<ParseRule>);
                      setShowRuleEditor(true);
                    }
                  }}
                >
                  手动配置规则
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={handleResetFile}
                >
                  重新选择
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ===== 渲染：映射步骤 =====
  const renderMappingStep = () => {
    if (!parseResult) return null;
    const { headers, mapping, rowCount } = parseResult;
    const standardFields = [
      { key: "", label: "— 忽略此列 —" },
      { key: "external_code", label: "外部编码" },
      { key: "receiver_store", label: "收货门店 (A组)" },
      { key: "receiver_name", label: "收件人姓名 (B组)" },
      { key: "receiver_phone", label: "收件人电话 (B组)" },
      { key: "receiver_address", label: "收件人地址 (B组)" },
      { key: "sku_code", label: "SKU物品编码" },
      { key: "sku_name", label: "SKU物品名称" },
      { key: "sku_qty", label: "SKU发货数量" },
      { key: "sku_spec", label: "SKU规格型号" },
      { key: "remark", label: "备注" },
    ];

    return (
      <div style={{ padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            确认字段映射
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            共识别到 {headers.length} 列，{rowCount} 行数据
            {parseResult.method === "rule" && (
              <span className="tag tag-cyan" style={{ marginLeft: 8 }}>
                规则: {parseResult.ruleName}
              </span>
            )}
            {selectedRule?.isAiGenerated && (
              <span className="tag tag-cyan" style={{ marginLeft: 4 }}>
                AI 生成
              </span>
            )}
          </div>
        </div>

        {/* 映射表格 */}
        <div className="table-container" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>源文件列名</th>
                <th>示例数据</th>
                <th style={{ minWidth: 200 }}>映射到标准字段</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((header, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>
                    {header}
                    {selectedRule?.isAiGenerated && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        marginLeft: 6,
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        background: "rgba(0,185,185,0.12)",
                        color: "var(--ztocc-primary)",
                        lineHeight: "1.4",
                      }}>
                        AI
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {parseResult.rows[0]?.[i] || "-"}
                  </td>
                  <td>
                    <select
                      className="input select"
                      value={mapping[header] || ""}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      style={{ width: "100%" }}
                    >
                      {standardFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 数据预览 */}
        <div className="card" style={{ padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>
            数据预览（前5行）
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parseResult.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 按钮 */}
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => { setStep("upload"); setShowRuleSelector(true); }}>
            返回
          </button>
          {selectedRule?.isAiGenerated && (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const res = await fetch("/api/rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ruleId: selectedRule.id.startsWith("ai_") ? undefined : selectedRule.id,
                      name: selectedRule.name || `AI规则_${Date.now()}`,
                      description: selectedRule.description || "AI 自动生成",
                      fileTypes: ["xlsx"],
                      config: {
                        sheets: "auto",
                        headerDetection: "auto",
                        columns: parseResult.headers.map((h) => ({
                          sourceHeader: h,
                          targetField: parseResult.mapping[h] || "",
                        })),
                        steps: [],
                      },
                    }),
                  });
                  const json = await res.json();
                  if (json.success) {
                    loadRules();
                    setError("");
                    alert("规则已保存！可在我已保存的规则中查看");
                  } else {
                    setError(json.message || "保存规则失败");
                  }
                } catch {
                  setError("保存规则失败");
                }
              }}
            >
              💾 保存为规则
            </button>
          )}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleConfirmMapping}
            style={{ flex: 1 }}
          >
            确认导入（{rowCount}行）
          </button>
        </div>

        {error && <div className="msg-bubble error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  };

  return (
    <>
      <div className="animate-fadeIn" style={{ display: showRuleEditor ? "none" : "block" }}>
        {step === "upload" && renderUploadStep()}
        {step === "mapping" && renderMappingStep()}
      </div>

      {/* 规则编辑器覆盖层 */}
      {showRuleEditor && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}>
          <div style={{ width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto" }}>
            <RuleEditor
              rule={editingRule}
              onSave={handleRuleSaved}
              onCancel={() => {
                setShowRuleEditor(false);
                setEditingRule(undefined);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
