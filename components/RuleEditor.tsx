"use client";

import { useState } from "react";
import type { ParseRule, RuleConfig, ColumnMapping, PostProcessor, PostProcessorType } from "@/lib/rules";

interface Props {
  rule?: Partial<ParseRule>;
  onSave: (rule: ParseRule) => void;
  onCancel: () => void;
}

const STANDARD_FIELDS = [
  { key: "external_code", label: "外部编码", required: false },
  { key: "receiver_store", label: "收货门店 (A组)", required: false },
  { key: "receiver_name", label: "收件人姓名 (B组)", required: false },
  { key: "receiver_phone", label: "收件人电话 (B组)", required: false },
  { key: "receiver_address", label: "收件人地址 (B组)", required: false },
  { key: "sku_code", label: "SKU物品编码", required: true },
  { key: "sku_name", label: "SKU物品名称", required: true },
  { key: "sku_qty", label: "SKU发货数量", required: true },
  { key: "sku_spec", label: "SKU规格型号", required: false },
  { key: "remark", label: "备注", required: false },
];

const POST_PROCESSOR_OPTIONS: { key: PostProcessorType; label: string }[] = [
  { key: "skip_rows_before_header", label: "跳过表头前空行" },
  { key: "skip_rows_after_header", label: "跳过表头后空行" },
  { key: "extract_tail_info", label: "提取尾部信息" },
  { key: "extract_header_fields", label: "提取头部字段" },
  { key: "aggregate_by_field", label: "按字段聚合" },
  { key: "transpose_matrix", label: "矩阵转置" },
  { key: "card_split", label: "卡片式拆分" },
  { key: "composite_split", label: "复合单元格拆分" },
  { key: "multi_sheet_merge", label: "多Sheet合并" },
  { key: "fill_from_source_name", label: "从文件名填充" },
  { key: "static_value", label: "静态默认值" },
  { key: "regex_extract", label: "正则提取" },
];

type Tab = "basic" | "mapping" | "steps" | "preview";

export default function RuleEditor({ rule, onSave, onCancel }: Props) {
  const [name, setName] = useState(rule?.name || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [fileTypes, setFileTypes] = useState<string[]>(rule?.fileTypes as string[] || ["xlsx"]);
  const [config, setConfig] = useState<RuleConfig>(rule?.config || {
    sheets: "auto",
    headerDetection: "auto",
    columns: [],
    steps: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ===== 试解析状态 =====
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewDragOver, setPreviewDragOver] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    rowCount: number;
    mapping: Record<string, string>;
  } | null>(null);
  const [previewError, setPreviewError] = useState("");

  const thStyle: React.CSSProperties = {
    padding: "8px 10px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 13,
    color: "var(--ztocc-table-header-text)",
    borderBottom: "1px solid var(--ztocc-table-border)",
    position: "sticky",
    top: 0,
    background: "var(--ztocc-table-header-bg)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 13,
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--ztocc-table-border)",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const FILE_TYPE_OPTIONS = [
    { key: "xlsx", label: "Excel (.xlsx)" },
    { key: "xls", label: "Excel (.xls)" },
    { key: "docx", label: "Word (.docx)" },
    { key: "pdf", label: "PDF (.pdf)" },
  ];

  const toggleFileType = (key: string) => {
    setFileTypes((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  };

  const updateColumn = (index: number, field: keyof ColumnMapping, value: unknown) => {
    setConfig((prev) => {
      const columns = [...prev.columns];
      columns[index] = { ...columns[index], [field]: value };
      return { ...prev, columns };
    });
  };

  const addColumn = () => {
    setConfig((prev) => ({
      ...prev,
      columns: [...prev.columns, { sourceHeader: "", targetField: "" }],
    }));
  };

  const removeColumn = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index),
    }));
  };

  const updateStep = (index: number, field: string, value: unknown) => {
    setConfig((prev) => {
      const steps = [...prev.steps];
      if (field === "type") {
        steps[index] = { type: value as PostProcessorType, config: {} };
      } else {
        steps[index] = { ...steps[index], [field]: value };
      }
      return { ...prev, steps };
    });
  };

  const addStep = () => {
    setConfig((prev) => ({
      ...prev,
      steps: [...prev.steps, { type: "skip_rows_before_header", config: { count: 1 } }],
    }));
  };

  const removeStep = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  };

  const renderStepConfig = (step: PostProcessor, index: number) => {
    switch (step.type) {
      case "skip_rows_before_header":
      case "skip_rows_after_header":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>跳过行数：</span>
            <input
              type="number"
              min={0}
              className="input"
              style={{ width: 80 }}
              value={String(step.config?.count ?? 1)}
              onChange={(e) => updateStep(index, "config", { ...step.config, count: parseInt(e.target.value) || 0 })}
            />
          </div>
        );
      case "extract_tail_info":
      case "extract_header_fields":
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            自动从文件首尾提取元信息（无需额外配置）
          </div>
        );
      case "transpose_matrix":
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            将二维矩阵数据转置为行记录（无需额外配置）
          </div>
        );
      case "multi_sheet_merge":
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            自动合并所有 Sheet 的数据（无需额外配置）
          </div>
        );
      case "aggregate_by_field":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>聚合字段：</span>
            <input
              className="input"
              style={{ width: 160 }}
              placeholder="例如: 运单号"
              value={String(step.config?.field ?? "")}
              onChange={(e) => updateStep(index, "config", { ...step.config, field: e.target.value })}
            />
          </div>
        );
      case "card_split":
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            按卡片式堆叠结构拆分数据（无需额外配置）
          </div>
        );
      case "composite_split":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>分隔符：</span>
            <input
              className="input"
              style={{ width: 80 }}
              placeholder="例如: /"
              value={String(step.config?.separator ?? "")}
              onChange={(e) => updateStep(index, "config", { ...step.config, separator: e.target.value })}
            />
          </div>
        );
      case "fill_from_source_name":
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            从文件名提取信息填充（无需额外配置）
          </div>
        );
      case "static_value":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>字段：</span>
            <select
              className="input select"
              style={{ width: 140 }}
              value={String(step.config?.targetField ?? "")}
              onChange={(e) => updateStep(index, "config", { ...step.config, targetField: e.target.value })}
            >
              <option value="">选择字段</option>
              {STANDARD_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>值：</span>
            <input
              className="input"
              style={{ width: 120 }}
              placeholder="默认值"
              value={String(step.config?.value ?? "")}
              onChange={(e) => updateStep(index, "config", { ...step.config, value: e.target.value })}
            />
          </div>
        );
      case "regex_extract":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>正则表达式：</span>
              <input
                className="input"
                style={{ width: 240 }}
                placeholder="例如: 订单号[：:]\s*(\w+)"
                value={String(step.config?.pattern ?? "")}
                onChange={(e) => updateStep(index, "config", { ...step.config, pattern: e.target.value })}
              />
            </div>
            <div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>目标字段：</span>
              <select
                className="input select"
                style={{ width: 140 }}
                value={String(step.config?.targetField ?? "")}
                onChange={(e) => updateStep(index, "config", { ...step.config, targetField: e.target.value })}
              >
                <option value="">选择字段</option>
                {STANDARD_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        );
      default:
        return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>无额外配置</div>;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("请输入规则名称");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        ruleId: rule?.id,
        name: name.trim(),
        description: description.trim(),
        fileTypes,
        config: {
          ...config,
          sheets: config.sheets || "auto",
          headerDetection: config.headerDetection || "auto",
          columns: config.columns || [],
          steps: config.steps || [],
        },
      };

      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success) {
        setSuccess("规则保存成功！");
        setTimeout(() => onSave(json.data), 800);
      } else {
        setError(json.message || "保存失败");
      }
    } catch (err) {
      setError("保存失败: " + String(err));
    }

    setSaving(false);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: "基本信息" },
    { key: "mapping", label: "列映射" },
    { key: "steps", label: "后处理" },
    { key: "preview", label: "试解析" },
  ];

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            {rule?.id ? "编辑解析规则" : "新建解析规则"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            配置文件的解析方式和字段映射
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--border-color)",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "10px 16px",
              border: "none",
              background: activeTab === tab.key ? "var(--bg-card)" : "transparent",
              color: activeTab === tab.key ? "var(--ztocc-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
              borderBottom: activeTab === tab.key ? "2px solid var(--ztocc-primary)" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20, maxHeight: "60vh", overflowY: "auto" }}>
        {error && (
          <div className="msg-bubble error" style={{ marginBottom: 16 }}>{error}</div>
        )}
        {success && (
          <div className="msg-bubble success" style={{ marginBottom: 16 }}>{success}</div>
        )}

        {/* Tab: Basic */}
        {activeTab === "basic" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                规则名称 <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                className="input"
                style={{ width: "100%" }}
                placeholder="例如：标准Excel导入规则"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                规则说明
              </label>
              <textarea
                className="input"
                style={{ width: "100%", minHeight: 60, resize: "vertical" }}
                placeholder="描述此规则适用于哪种文件格式..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                适用文件类型
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className={`tag ${fileTypes.includes(opt.key) ? "tag-cyan" : ""}`}
                    style={{
                      cursor: "pointer",
                      padding: "6px 14px",
                      borderRadius: 4,
                      border: `1px solid ${fileTypes.includes(opt.key) ? "var(--ztocc-primary)" : "var(--border-color)"}`,
                      background: fileTypes.includes(opt.key) ? "var(--ztocc-primary-opacity, rgba(0,185,185,0.08))" : "var(--bg-card)",
                      userSelect: "none",
                    }}
                    onClick={() => toggleFileType(opt.key)}
                  >
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Sheet选择
              </label>
              <select
                className="input select"
                style={{ width: 160 }}
                value={typeof config.sheets === "string" ? config.sheets : "custom"}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig((prev) => ({
                    ...prev,
                    sheets: (val === "custom" ? [0] : val) as "auto" | "all" | number[],
                  }));
                }}
              >
                <option value="auto">自动检测</option>
                <option value="all">全部合并</option>
                <option value="custom">自定义索引</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                表头检测
              </label>
              <select
                className="input select"
                style={{ width: 160 }}
                value={typeof config.headerDetection === "string" ? config.headerDetection : "manual"}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig((prev) => ({
                    ...prev,
                    headerDetection: (val === "manual" ? { row: 1 } : val) as "auto" | { row: number },
                  }));
                }}
              >
                <option value="auto">自动检测</option>
                <option value="manual">固定行号</option>
              </select>
              {typeof config.headerDetection === "object" && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>第</span>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    style={{ width: 60 }}
                    value={config.headerDetection.row}
                    onChange={(e) => setConfig((prev) => ({
                      ...prev,
                      headerDetection: { row: parseInt(e.target.value) || 1 },
                    }))}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>行</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tab: Mapping */}
        {activeTab === "mapping" && (
          <div>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                配置源文件列与标准字段之间的映射关系
              </span>
              <button className="btn btn-sm btn-primary" onClick={addColumn}>
                + 添加映射
              </button>
            </div>

            {config.columns.length === 0 ? (
              <div
                className="card"
                style={{ padding: 32, textAlign: "center", borderStyle: "dashed", cursor: "pointer" }}
                onClick={addColumn}
              >
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>
                  暂无列映射
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  点击「添加映射」开始配置
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {config.columns.map((col, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "var(--ztocc-primary)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>

                    <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        className="input"
                        style={{ width: 140 }}
                        placeholder="源列表头名称"
                        value={col.sourceHeader || ""}
                        onChange={(e) => updateColumn(i, "sourceHeader", e.target.value)}
                      />
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>或</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 70 }}
                        placeholder="列索引"
                        value={col.sourceIndex !== undefined ? String(col.sourceIndex) : ""}
                        onChange={(e) => updateColumn(i, "sourceIndex", e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>→</span>
                      <select
                        className="input select"
                        style={{ width: 180 }}
                        value={col.targetField}
                        onChange={(e) => updateColumn(i, "targetField", e.target.value)}
                      >
                        <option value="">选择标准字段</option>
                        {STANDARD_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label} {f.required ? "*" : ""}
                          </option>
                        ))}
                      </select>

                      <input
                        className="input"
                        style={{ width: 100 }}
                        placeholder="默认值"
                        value={col.defaultValue || ""}
                        onChange={(e) => updateColumn(i, "defaultValue", e.target.value)}
                      />
                    </div>

                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => removeColumn(i)}
                      style={{ flexShrink: 0 }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Steps */}
        {activeTab === "steps" && (
          <div>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                配置解析后的后处理步骤（按执行顺序）
              </span>
              <button className="btn btn-sm btn-primary" onClick={addStep}>
                + 添加步骤
              </button>
            </div>

            {config.steps.length === 0 ? (
              <div
                className="card"
                style={{ padding: 32, textAlign: "center", borderStyle: "dashed", cursor: "pointer" }}
                onClick={addStep}
              >
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>
                  暂无后处理步骤
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  点击「添加步骤」开始配置
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {config.steps.map((step, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{
                      padding: "12px 16px",
                      borderLeft: "3px solid var(--ztocc-primary)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}>
                          {i + 1}
                        </span>
                        <select
                          className="input select"
                          style={{ width: 180 }}
                          value={step.type}
                          onChange={(e) => updateStep(i, "type", e.target.value)}
                        >
                          {POST_PROCESSOR_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => removeStep(i)}
                      >
                        删除
                      </button>
                    </div>
                    <div style={{ paddingLeft: 30 }}>
                      {renderStepConfig(step, i)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: 试解析 */}
        {activeTab === "preview" && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                试解析
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                使用当前的规则配置对文件进行试解析，预览结果
              </span>
            </div>

            {/* 上传区域 */}
            <div
              style={{
                padding: 32,
                textAlign: "center",
                border: `2px dashed ${previewFile ? "var(--ztocc-primary)" : previewDragOver ? "var(--ztocc-primary)" : "var(--border-color)"}`,
                borderRadius: 8,
                background: previewDragOver ? "rgba(0,185,185,0.04)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.2s",
                marginBottom: 16,
              }}
              onClick={() => !previewFile && document.getElementById("preview-file-input")?.click()}
              onDragOver={(e) => { e.preventDefault(); setPreviewDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setPreviewDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setPreviewDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) {
                  setPreviewFile(f);
                  setPreviewResult(null);
                  setPreviewError("");
                }
              }}
            >
              <input
                id="preview-file-input"
                type="file"
                accept=".xlsx,.xls,.pdf,.docx,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPreviewFile(f);
                    setPreviewResult(null);
                    setPreviewError("");
                  }
                }}
              />
              {previewFile ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
                    {previewFile.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    {(previewFile.size / 1024).toFixed(1)} KB
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFile(null);
                        setPreviewResult(null);
                        setPreviewError("");
                      }}
                    >
                      重新选择
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={previewLoading}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!previewFile) return;

                        setPreviewLoading(true);
                        setPreviewError("");
                        setPreviewResult(null);

                        try {
                          const formData = new FormData();
                          formData.append("file", previewFile);

                          // 构建规则 JSON 对象：包含完整的 config
                          const previewRule = {
                            name: name || "试解析规则",
                            fileTypes,
                            config: {
                              sheets: config.sheets,
                              headerDetection: config.headerDetection,
                              columns: config.columns,
                              steps: config.steps,
                            },
                          };
                          formData.append("rule", JSON.stringify(previewRule));

                          const res = await fetch("/api/orders/import", { method: "POST", body: formData });
                          const json = await res.json();

                          if (json.success) {
                            setPreviewResult({
                              headers: json.headers || json.data?.headers || [],
                              rows: json.rows || json.data?.rows || [],
                              rowCount: json.rowCount || json.data?.rowCount || 0,
                              mapping: json.mapping || json.data?.mapping || {},
                            });
                          } else {
                            setPreviewError(json.message || "解析失败");
                          }
                        } catch (err) {
                          setPreviewError("解析失败: " + String(err));
                        }

                        setPreviewLoading(false);
                      }}
                    >
                      {previewLoading ? "解析中..." : "开始试解析"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 36, marginBottom: 6, opacity: previewDragOver ? 1 : 0.4 }}>
                    {previewDragOver ? "📥" : "📂"}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 2 }}>
                    {previewDragOver ? "松开以上传文件" : "拖拽文件到此处或点击上传"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    选择一个示例文件进行试解析
                  </div>
                </div>
              )}
            </div>

            {/* 错误提示 */}
            {previewError && (
              <div style={{
                padding: "10px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                fontSize: 13,
                color: "#dc2626",
                marginBottom: 16,
              }}>
                {previewError}
              </div>
            )}

            {/* 预览结果 */}
            {previewResult && previewResult.headers.length > 0 && (
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span>✅ 解析结果预览</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>
                    共解析 {previewResult.rowCount} 行数据
                  </span>
                </div>
                <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--ztocc-table-border)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        {previewResult.headers.map((h, i) => (
                          <th key={i} style={thStyle}>
                            {h}
                            {previewResult.mapping[h] && (
                              <span style={{ marginLeft: 4, fontSize: 11, color: "var(--ztocc-primary)" }}>
                                → {previewResult.mapping[h]}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.rows.slice(0, 50).map((row, ri) => (
                        <tr key={ri}>
                          <td style={{ ...tdStyle, color: "var(--text-muted)", textAlign: "center" }}>{ri + 1}</td>
                          {previewResult.headers.map((h, ci) => (
                            <td key={ci} style={tdStyle}>{row[h] || "-"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewResult.rowCount > 50 && (
                    <div style={{
                      padding: "8px 12px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      borderTop: "1px solid var(--ztocc-table-border)",
                    }}>
                      仅显示前50行，共 {previewResult.rowCount} 行
                    </div>
                  )}
                </div>
              </div>
            )}

            {previewResult && previewResult.headers.length === 0 && (
              <div style={{
                padding: 20,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
                border: "1px dashed var(--border-color)",
                borderRadius: 6,
              }}>
                文件解析完成但未提取到数据行，请检查规则配置
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--border-color)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {rule?.id ? `上次修改: ${rule.updatedAt ? new Date(rule.updatedAt).toLocaleString() : "-"}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存规则"}
          </button>
        </div>
      </div>
    </div>
  );
}
