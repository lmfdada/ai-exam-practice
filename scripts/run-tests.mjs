/**
 * 综合测试脚本 — 测试所有样例文件 + AI 生成规则
 *
 * 用法: node scripts/run-tests.mjs [port]
 * 默认端口: 3000
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || "3000", 10);
const BASE = `http://localhost:${PORT}`;
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");

// ===== 测试文件列表 =====
const SAMPLES = [
  "湖南仓.xlsx",
  "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx",
  "门店调拨单-卡片式.xlsx",
  "多门店分Sheet出库单.xlsx",
  "欢乐牧场模板0430.xlsx",
  "黔寨寨贵州烙锅（鞍山店）常温.pdf",
];

// ===== 预定义规则（用于复杂格式） =====
const RULES = {
  "门店调拨单-卡片式.xlsx": {
    config: {
      sheets: "auto",
      headerDetection: { row: 5 },
      columns: [
        { sourceIndex: 0, targetField: "sku_code" },
        { sourceIndex: 1, targetField: "sku_name" },
        { sourceIndex: 2, targetField: "sku_spec" },
        { sourceIndex: 3, targetField: "sku_qty" },
      ],
      steps: [
        {
          type: "extract_header_fields",
          config: {
            fieldSource: [
              { field: "receiver_store", rowOffset: -2, keywords: ["调入门店"] },
              { field: "receiver_name", rowOffset: -2, keywords: ["收货人"] },
              { field: "receiver_phone", rowOffset: -2, keywords: ["电话"] },
              { field: "receiver_address", rowOffset: -1, keywords: ["收货地址"] },
            ],
          },
        },
      ],
    },
  },
  "多门店分Sheet出库单.xlsx": {
    config: {
      sheets: "all",
      headerDetection: { row: 2 },
      columns: [
        { sourceIndex: 1, targetField: "sku_code" },
        { sourceIndex: 2, targetField: "sku_name" },
        { sourceIndex: 3, targetField: "sku_spec" },
        { sourceIndex: 5, targetField: "sku_qty" },
        { sourceIndex: 7, targetField: "remark" },
      ],
      steps: [
        { type: "fill_from_source_name", config: { targetField: "receiver_store" } },
      ],
    },
  },
  "欢乐牧场模板0430.xlsx": {
    config: {
      sheets: "auto",
      headerDetection: "auto",
      columns: [
        { sourceIndex: 0, targetField: "warehouse_name" },
        { sourceIndex: 1, targetField: "owner_name" },
        { sourceIndex: 2, targetField: "sku_name" },
        { sourceIndex: 3, targetField: "sku_code" },
      ],
      steps: [
        {
          type: "transpose_matrix",
          config: {
            rowField: "sku_name",
            colFields: ["银泰", "金银潭", "金桥", "门店B", "门店D"],
            valueField: "sku_qty",
          },
        },
      ],
    },
  },
};

// ===== 工具函数 =====
async function testImport(filename, ruleDef = null) {
  const filepath = path.join(SAMPLES_DIR, filename);
  if (!existsSync(filepath)) {
    return { success: false, filename, error: "文件不存在" };
  }

  const buffer = readFileSync(filepath);
  const formData = new FormData();
  const blob = new Blob([buffer]);
  formData.append("file", blob, filename);
  if (ruleDef) {
    formData.append("rule", JSON.stringify(ruleDef));
  }

  const res = await fetch(`${BASE}/api/orders/import`, { method: "POST", body: formData });
  return { success: res.ok, filename, status: res.status, data: await res.json() };
}

async function testAIRuleGen(filename) {
  const filepath = path.join(SAMPLES_DIR, filename);
  if (!existsSync(filepath)) {
    return { success: false, filename, error: "文件不存在" };
  }

  const buffer = readFileSync(filepath);
  const formData = new FormData();
  const blob = new Blob([buffer]);
  formData.append("file", blob, filename);

  const res = await fetch(`${BASE}/api/rules/generate`, { method: "POST", body: formData });
  // AI might timeout or fail - that's OK
  const data = await res.json().catch(() => ({ success: false, message: "JSON parse error" }));
  return { success: res.ok, filename, status: res.status, data };
}

function summarizeResult(apiResult) {
  const { success, data } = apiResult;
  if (!success || !data?.success) {
    return { ok: false, message: data?.message || data?.error || "未知错误" };
  }
  const d = data.data;
  const headers = d?.headers || [];
  const rowCount = d?.rowCount || 0;
  const mapping = d?.mapping || {};

  // 检查是否映射到了标准字段
  const standardFields = ["external_code", "receiver_store", "receiver_name", "receiver_phone", "receiver_address", "sku_code", "sku_name", "sku_qty", "sku_spec", "remark"];
  const mappedFields = Object.values(mapping).filter(v => standardFields.includes(v));
  
  return {
    ok: true,
    rowCount,
    headerCount: headers.length,
    mappedStandardFields: [...new Set(mappedFields)],
    mapping,
    sampleRows: d?.rows?.slice(0, 2) || [],
  };
}

// ===== 主测试流程 =====
async function main() {
  console.log("=".repeat(70));
  console.log("  万能导入 V2 — 综合测试");
  console.log(`  服务器: ${BASE}`);
  console.log(`  样例目录: ${SAMPLES_DIR}`);
  console.log("=".repeat(70));

  // 1. 检查服务器连通性
  console.log("\n📡 检查服务器...");
  try {
    const health = await fetch(`${BASE}/api/setup`, { method: "GET", signal: AbortSignal.timeout(5000) });
    const healthData = await health.json();
    console.log(`  ✅ 服务器正常: ${healthData.message || "OK"}`);
  } catch (e) {
    console.error(`  ❌ 无法连接服务器 ${BASE}: ${e.message}`);
    console.log(`  💡 请先启动: npm run dev`);
    process.exit(1);
  }

  const results = [];

  // 2. 测试所有文件（不传规则 — 自动解析）
  console.log("\n" + "=".repeat(70));
  console.log("  📋 测试 1: 无规则自动解析（回退到原始数据提取）");
  console.log("=".repeat(70));

  for (const filename of SAMPLES) {
    const apiResult = await testImport(filename);
    const summary = summarizeResult(apiResult);
    results.push({ filename, mode: "no-rule", ...summary });

    const icon = summary.ok ? "✅" : "❌";
    if (summary.ok) {
      console.log(`  ${icon} ${filename}`);
      console.log(`    行数: ${summary.rowCount}, 列数: ${summary.headerCount}`);
      if (summary.mappedStandardFields.length > 0) {
        console.log(`    自动映射: ${summary.mappedStandardFields.join(", ")}`);
      } else {
        console.log(`    ⚠️  未映射到任何标准字段（回退模式 — 显示原始列）`);
      }
    } else {
      console.log(`  ${icon} ${filename} — ${summary.message}`);
    }
  }

  // 3. 测试复杂格式（带预定义规则）
  console.log("\n" + "=".repeat(70));
  console.log("  📋 测试 2: 带规则解析（验证规则引擎）");
  console.log("=".repeat(70));

  for (const [filename, ruleDef] of Object.entries(RULES)) {
    const apiResult = await testImport(filename, ruleDef);
    const summary = summarizeResult(apiResult);
    results.push({ filename, mode: "with-rule", ...summary });

    const icon = summary.ok ? "✅" : "❌";
    if (summary.ok) {
      console.log(`  ${icon} ${filename}`);
      console.log(`    行数: ${summary.rowCount}, 列数: ${summary.headerCount}`);
      console.log(`    标准字段映射: ${summary.mappedStandardFields.join(", ") || "无"}`);
      if (summary.sampleRows.length > 0) {
        const sample = summary.sampleRows[0];
        const fields = Object.fromEntries(
          Object.entries(sample).filter(([, v]) => v)
        );
        console.log(`    样例数据: ${JSON.stringify(fields).slice(0, 120)}`);
      }
    } else {
      console.log(`  ${icon} ${filename}`);
      console.log(`    错误: ${summary.message}`);
    }
  }

  // 4. 测试 AI 生成规则（DeepSeek）
  console.log("\n" + "=".repeat(70));
  console.log("  🤖 测试 3: AI 生成规则（DeepSeek）");
  console.log("=".repeat(70));

  for (const filename of SAMPLES.slice(0, 3)) { // 只测试前3个
    console.log(`  🔄 ${filename}...`);
    const apiResult = await testAIRuleGen(filename);
    const icon = apiResult.success && apiResult.data?.success ? "✅" : "⚠️";
    
    if (apiResult.data?.success && apiResult.data?.data) {
      const rule = apiResult.data.data;
      const colCount = rule.config?.columns?.length || 0;
      const stepCount = rule.config?.steps?.length || 0;
      const specCount = rule.config?.columns?.filter(c => c.isSpeculative)?.length || 0;
      console.log(`  ${icon} AI 生成成功`);
      console.log(`    规则名: ${rule.name}`);
      console.log(`    列映射: ${colCount} 个字段${specCount > 0 ? ` (${specCount} 个推测)` : ""}`);
      console.log(`    后处理步骤: ${stepCount} 个`);
    } else {
      console.log(`  ${icon} AI 生成: ${apiResult.data?.message || apiResult.data?.error || "未知结果"}`);
    }
  }

  // 5. 汇总
  console.log("\n" + "=".repeat(70));
  console.log("  📊 测试结果汇总");
  console.log("=".repeat(70));

  const total = results.length;
  const passed = results.filter(r => r.ok).length;

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const modeLabel = r.mode === "no-rule" ? "无规则" : "带规则";
    console.log(`  ${icon} [${modeLabel}] ${r.filename}${r.ok ? ` — ${r.rowCount}行, ${r.mappedStandardFields.length}个字段映射` : ""}`);
  }

  console.log(`\n  📈 总计: ${passed}/${total} 通过`);

  // 保存详细结果
  const reportPath = path.resolve(__dirname, "..", "test-report.json");
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    server: BASE,
    total,
    passed,
    results,
  }, null, 2));
  console.log(`\n  📝 详细报告已保存: ${reportPath}`);

  // 退出码
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
