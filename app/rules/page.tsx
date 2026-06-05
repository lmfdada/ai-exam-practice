"use client";

import { useState, useEffect, useCallback } from "react";
import RuleEditor from "@/components/RuleEditor";
import type { ParseRule } from "@/lib/rules";

interface Rule {
  id: string;
  name: string;
  description: string;
  fileTypes: string[];
  usedCount: number;
  isAiGenerated?: boolean;
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<ParseRule> | undefined>(undefined);
  const [searchText, setSearchText] = useState("");

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules");
      const json = await res.json();
      if (json.success) {
        setRules(json.data || []);
      }
    } catch {
      setError("加载规则列表失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = () => {
    setEditingRule(undefined);
    setShowEditor(true);
  };

  const handleEditRule = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/rules?ruleId=${rule.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setEditingRule({
          id: rule.id,
          name: json.data.name || rule.name,
          description: json.data.description || rule.description,
          fileTypes: json.data.fileTypes || rule.fileTypes,
          config: json.data.config || {},
        });
        setShowEditor(true);
      }
    } catch {
      setError("获取规则详情失败");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!confirm(`确认删除规则「${rule?.name}」？`)) return;
    try {
      const res = await fetch(`/api/rules?ruleId=${ruleId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      } else {
        setError(json.message || "删除失败");
      }
    } catch {
      setError("删除规则失败");
    }
  };

  const handleCopyRule = async (rule: Rule) => {
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

  const handleRuleSaved = () => {
    setShowEditor(false);
    setEditingRule(undefined);
    loadRules();
  };

  const filteredRules = rules.filter(
    (r) =>
      !searchText ||
      r.name.toLowerCase().includes(searchText.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* 顶部 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ztocc-text-primary)" }}>
            规则管理
          </div>
          <div style={{ fontSize: 12, color: "var(--ztocc-text-secondary)", marginTop: 2 }}>
            共 {rules.length} 条规则
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleCreateRule}>
          + 新建规则
        </button>
      </div>

      {/* 搜索 */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <input
          className="input"
          placeholder="搜索规则名称或描述..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300, height: 32, padding: "0 12px", fontSize: 13 }}
        />
      </div>

      {/* 规则列表 */}
      <div className="main-content-card" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--ztocc-text-secondary)",
            }}
          >
            加载中...
          </div>
        ) : filteredRules.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--ztocc-text-secondary)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
              {searchText ? "未找到匹配的规则" : "暂无规则"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)", marginBottom: 16 }}>
              {searchText
                ? "尝试其他关键词"
                : "点击上方「新建规则」按钮创建第一条规则"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredRules.map((rule) => (
              <div
                key={rule.id}
                className="card"
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                }}
                onClick={() => handleEditRule(rule)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ztocc-text-primary)" }}>
                    {rule.name}
                    {rule.isAiGenerated && (
                      <span
                        className="tag tag-cyan"
                        style={{ marginLeft: 6, fontSize: 10 }}
                      >
                        AI
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ztocc-text-secondary)", marginTop: 2 }}>
                    {rule.description || "暂无描述"}{" "}
                    <span style={{ color: "var(--ztocc-text-placeholder)" }}>
                      · {rule.fileTypes.join(", ").toUpperCase()}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ztocc-text-placeholder)",
                      marginRight: 8,
                    }}
                  >
                    已使用 {rule.usedCount ?? 0} 次
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyRule(rule);
                    }}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    复制
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRule(rule.id);
                    }}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 规则编辑器 */}
      {showEditor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 680,
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <RuleEditor
              rule={editingRule}
              onSave={handleRuleSaved}
              onCancel={() => {
                setShowEditor(false);
                setEditingRule(undefined);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
