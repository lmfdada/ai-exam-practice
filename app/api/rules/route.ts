import { NextRequest, NextResponse } from "next/server";
import { safeGetDb } from "@/lib/db";
import { generateRuleId } from "@/lib/rules";

/** GET: 获取规则列表或单个规则 */
export async function GET(request: NextRequest) {
  try {
    const sql = safeGetDb();
    if (!sql) {
      return NextResponse.json({ success: true, data: [] });
    }
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");

    if (ruleId) {
      const result = await sql`
        SELECT * FROM parse_rules WHERE rule_id = ${ruleId} LIMIT 1
      `;
      if (result.length === 0) {
        return NextResponse.json({ success: false, message: "规则不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: formatRule(result[0] as Record<string, unknown>) });
    }

    const result = await sql`
      SELECT * FROM parse_rules ORDER BY updated_at DESC
    `;
    return NextResponse.json({
      success: true,
      data: result.map((r: unknown) => formatRule(r as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("查询规则失败:", error);
    return NextResponse.json({ success: false, message: "查询失败", error: String(error) }, { status: 500 });
  }
}

/** POST: 创建或更新规则 */
export async function POST(request: NextRequest) {
  try {
    const sql = safeGetDb();
    if (!sql) {
      return NextResponse.json(
        { success: false, message: "数据库未连接，无法保存规则" },
        { status: 503 }
      );
    }
    const body = await request.json();
    const { ruleId, name, description, fileTypes, config } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: "规则名称不能为空" }, { status: 400 });
    }

    const id = ruleId || generateRuleId();
    const now = new Date().toISOString();

    const existing = await sql`SELECT * FROM parse_rules WHERE rule_id = ${id} LIMIT 1`;

    if (existing.length > 0) {
      // 更新
      await sql`
        UPDATE parse_rules SET
          name = ${name},
          description = ${description || ""},
          file_types = ${JSON.stringify(fileTypes || ["xlsx"])},
          config = ${JSON.stringify(config || {})},
          updated_at = ${now}
        WHERE rule_id = ${id}
      `;
    } else {
      // 创建
      await sql`
        INSERT INTO parse_rules (rule_id, name, description, file_types, config)
        VALUES (${id}, ${name}, ${description || ""}, ${JSON.stringify(fileTypes || ["xlsx"])}, ${JSON.stringify(config || {})})
      `;
    }

    const result = await sql`SELECT * FROM parse_rules WHERE rule_id = ${id} LIMIT 1`;
    return NextResponse.json({ success: true, data: formatRule(result[0] as Record<string, unknown>) });
  } catch (error) {
    console.error("保存规则失败:", error);
    return NextResponse.json({ success: false, message: "保存失败", error: String(error) }, { status: 500 });
  }
}

/** DELETE: 删除规则 */
export async function DELETE(request: NextRequest) {
  try {
    const sql = safeGetDb();
    if (!sql) {
      return NextResponse.json(
        { success: false, message: "数据库未连接，无法删除规则" },
        { status: 503 }
      );
    }
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return NextResponse.json({ success: false, message: "缺少 ruleId 参数" }, { status: 400 });
    }

    await sql`DELETE FROM parse_rules WHERE rule_id = ${ruleId}`;
    return NextResponse.json({ success: true, message: "规则已删除" });
  } catch (error) {
    console.error("删除规则失败:", error);
    return NextResponse.json({ success: false, message: "删除失败", error: String(error) }, { status: 500 });
  }
}

/** 安全解析 JSON，失败时返回原始值或默认值 */
function safeJsonParse(val: unknown, fallback: unknown = null) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      // 可能是旧数据存储的纯字符串（非 JSON），尝试返回字符串本身或默认值
      return fallback !== null ? fallback : val;
    }
  }
  return val ?? fallback;
}

/** 格式化数据库记录 */
function formatRule(row: Record<string, unknown>) {
  return {
    id: row.rule_id,
    name: row.name,
    description: row.description,
    fileTypes: safeJsonParse(row.file_types, ["xlsx"]),
    config: safeJsonParse(row.config, {}),
    isAiGenerated: row.is_ai_generated,
    usedCount: row.used_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
