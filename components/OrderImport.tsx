"use client";

import React, { useState, useRef, useCallback } from "react";
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

type Step = "select" | "upload" | "mapping" | "generating";

export default function OrderImport({ onImportComplete }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [parseResult, setParseResult] = useState<ImportData | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<ParseRule> | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
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

  // ===== 新建规则 =====
  const handleNewRule = () => {
    setEditingRule(undefined);
    setShowRuleEditor(true);
  };

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
      // 先获取完整规则详情
      const res = await fetch(`/api/rules?ruleId=${rule.id}`);
      const json = await res.json();
      if (!json.success || !json.data) {
        setError("获取规则详情失败");
        return;
      }

      const ruleData = json.data;
      // 创建副本（不传 ruleId 即为新建）
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
    // 刷新规则列表
    loadRules();
    // 自动选中新保存的规则
    setSelectedRule({
      id: savedRule.id,
      name: savedRule.name,
      description: savedRule.description,
      fileTypes: savedRule.fileTypes as string[],
      usedCount: 0,
      isAiGenerated: !!(savedRule as unknown as Record<string, unknown>).isAiGenerated,
    });
  };

  // ===== 选择已有规则 =====
  const handleSelectRule = (rule: Rule) => {
    setSelectedRule(rule);
    setStep("upload");
  };

  // ===== AI 生成规则 =====
  const handleAIGenerate = async () => {
    setStep("generating");
    setError("");

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.pdf,.docx,.csv,.txt";
    input.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) { setStep("select"); return; }

      setStep("generating");

      const formData = new FormData();
      formData.append("file", f);

      try {
        const res = await fetch("/api/rules/generate", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();

        if (json.success && json.data) {
          const newRule: Rule = {
            id: json.data.id || `ai_${Date.now()}`,
            name: json.data.name || f.name,
            description: json.data.description || "AI 自动生成",
            fileTypes: json.data.fileTypes || ["xlsx"],
            usedCount: 0,
            isAiGenerated: true,
          };

          // 先选这个规则，再上传文件
          setSelectedRule(newRule);
          setStep("upload");
          setFile(f);
        } else {
          setError(json.message || json.fallback?.message || "AI 生成规则失败");
          setStep("select");
        }
      } catch (err) {
        setError("AI 生成规则失败: " + String(err));
        setStep("select");
      }
    };
    input.click();
  };

  // ===== 手动上传文件（无规则或已有规则时） =====
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!file) { setError("请选择文件"); return; }

    setUploading(true);
    setUploadProgress(0);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    if (selectedRule) {
      formData.append("rule", JSON.stringify(selectedRule));
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
                  method: selectedRule ? "rule" : "auto",
                  ruleName: selectedRule?.name,
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

  // ===== 渲染步骤 =====
  const renderSelectStep = () => (
    <div style={{ padding: 40 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          选择解析方式
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          选择一个已有的解析规则，或使用 AI 智能分析文件生成规则
        </div>
      </div>

      {/* 规则列表 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
            已有解析规则
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={loadRules}>
              刷新
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleNewRule}>
              + 新建规则
            </button>
          </div>
        </div>

        {rulesLoading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
            加载中...
          </div>
        ) : rules.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 32,
              textAlign: "center",
              cursor: "pointer",
              borderStyle: "dashed",
            }}
            onClick={loadRules}
          >
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>
              暂无保存的规则
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              点击加载或点击「+ 新建规则」创建新规则
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="card"
                style={{
                  padding: "12px 16px",
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
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                    {rule.name}
                    {rule.isAiGenerated && (
                      <span className="tag tag-cyan" style={{ marginLeft: 8, fontSize: 11 }}>
                        AI
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {rule.description || rule.fileTypes.join(", ")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    已用 {rule.usedCount || 0} 次
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={(e) => handleEditRule(e, rule)}
                    title="编辑规则"
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={(e) => handleCopyRule(e, rule)}
                    title="复制规则"
                  >
                    复制
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => handleDeleteRule(e, rule.id)}
                    title="删除规则"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={handleAIGenerate}
          style={{ flex: 1, height: 36 }}
        >
          AI 智能生成规则
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setSelectedRule(null);
            setStep("upload");
          }}
          style={{ flex: 1, height: 36 }}
        >
          直接上传（自动解析）
        </button>
      </div>
    </div>
  );

  const renderUploadStep = () => (
    <div style={{ padding: 40 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          上传文件
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          {selectedRule
            ? `使用规则「${selectedRule.name}」解析文件`
            : "系统将自动检测文件结构并建立列映射"}
        </div>
      </div>

      {/* 规则摘要 */}
      {selectedRule && (
        <div className="card" style={{
          padding: "10px 16px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderLeft: "3px solid var(--primary)",
        }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>当前规则：</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
            {selectedRule.name}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {selectedRule.description}
          </span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => { setSelectedRule(null); setStep("select"); }}
            style={{ marginLeft: "auto" }}
          >
            更换
          </button>
        </div>
      )}

      {/* 文件上传区域 */}
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          borderStyle: "dashed",
          cursor: "pointer",
          borderColor: dragOver
            ? "var(--ztocc-primary)"
            : file
              ? "var(--primary)"
              : "var(--border-color)",
          background: dragOver ? "rgba(0,185,185,0.04)" : "var(--bg-card)",
          transition: "all 0.2s",
        }}
        onClick={() => !file && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const droppedFiles = e.dataTransfer.files;
          if (droppedFiles.length > 0) {
            const f = droppedFiles[0];
            const ext = f.name.split(".").pop()?.toLowerCase() || "";
            if (["xlsx", "xls", "pdf", "docx", "csv"].includes(ext)) {
              setFile(f);
              setError("");
            } else {
              setError("不支持的文件格式，请上传 .xlsx .xls .pdf .docx .csv 文件");
            }
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

        {file ? (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              {(file.size / 1024).toFixed(1)} KB
            </div>
            <button className="btn btn-sm btn-secondary" onClick={(e) => {
              e.stopPropagation();
              setFile(null);
            }}>
              重新选择
            </button>
          </div>
        ) : (
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
          </div>
        )}
      </div>

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

      {/* 按钮 */}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={() => setStep("select")}>
          返回
        </button>
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{ flex: 1 }}
        >
          {uploading ? "解析中..." : "开始解析"}
        </button>
      </div>

      {error && <div className="msg-bubble error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );

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
                  <td style={{ fontWeight: 500 }}>{header}</td>
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
          <button className="btn btn-secondary" onClick={() => setStep("upload")}>
            重新上传
          </button>
          {selectedRule?.isAiGenerated && (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                // 从 selectedRule 获取 AI 生成的规则信息并保存
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
            确认导入({rowCount}行)
          </button>
        </div>

        {error && <div className="msg-bubble error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  };

  const renderGeneratingStep = () => (
    <div style={{ padding: 60, textAlign: "center" }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "3px solid var(--border-color)",
        borderTopColor: "var(--primary)",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 16px",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 16, color: "var(--text-primary)", marginBottom: 4 }}>
        AI 正在分析文件结构...
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        大模型正在解析文件内容，自动生成解析规则
      </div>
    </div>
  );

  return (
    <>
      <div className="animate-fadeIn" style={{ display: showRuleEditor ? "none" : "block" }}>
        {step === "select" && renderSelectStep()}
        {step === "generating" && renderGeneratingStep()}
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
          <div style={{
            width: "100%",
            maxWidth: 680,
            maxHeight: "90vh",
            overflow: "auto",
          }}>
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
