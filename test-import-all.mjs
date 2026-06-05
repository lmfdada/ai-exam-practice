/**
 * 批量测试前6份出库单的导入解析
 * 用法: node test-import-all.mjs
 */
import { readFileSync } from "fs";

const BASE_URL = "http://localhost:3000";

const SAMPLES = [
  { file: "samples/湖南仓.xlsx", name: "1. 湖南仓.xlsx（aggregate_by_field）" },
  { file: "samples/欢乐牧场模板0430.xlsx", name: "2. 欢乐牧场模板0430.xlsx（transpose_matrix）" },
  { file: "samples/多门店分Sheet出库单.xlsx", name: "3. 多门店分Sheet出库单.xlsx（multi_sheet_merge）" },
  { file: "samples/门店调拨单-卡片式.xlsx", name: "4. 门店调拨单-卡片式.xlsx（card_split）" },
  { file: "samples/黔寨寨贵州烙锅（鞍山店）常温.pdf", name: "5. 黔寨寨贵州烙锅（鞍山店）常温.pdf" },
  { file: "samples/12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx", name: "6. 配送发货单.xlsx（extract_tail_info）" },
];

async function testFile(sample) {
  console.log(`\n========== ${sample.name} ==========`);
  try {
    const fileData = readFileSync(sample.file);
    const blob = new Blob([fileData]);
    const formData = new FormData();
    const fileName = sample.file.split("/").pop();
    formData.append("file", blob, fileName);

    const start = Date.now();
    const res = await fetch(`${BASE_URL}/api/orders/import`, {
      method: "POST",
      body: formData,
    });
    const elapsed = Date.now() - start;
    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (!json.success) {
        console.log(`  ❌ API 返回失败`);
        return { success: false, error: "API fail" };
      }

      const data = json.data || {};
      const headers = data.headers || [];
      const rows = data.rows || [];
      
      console.log(`  ✅ 解析成功`);
      console.log(`  字段数: ${headers.length}`);
      console.log(`  数据行数: ${rows.length}`);
      console.log(`  字段: ${headers.slice(0, 15).join(" | ")}`);
      
      if (rows.length > 0) {
        console.log(`  第1行: ${JSON.stringify(rows[0]).slice(0, 250)}`);
      }
      console.log(`  ⏱ ${elapsed}ms`);
      
      return { success: true, rows: rows.length, headers: headers.length };
    } catch {
      console.log(`  ❌ 响应不可解析, 长度=${text.length}`);
      return { success: false, error: "parse error" };
    }
  } catch (err) {
    console.log(`  ❌ 请求异常: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log("===== 前6份出库单导入解析测试 =====\n");

  const results = [];
  for (const sample of SAMPLES) {
    const result = await testFile(sample);
    results.push(result);
  }

  console.log("\n\n===== 测试汇总 =====");
  let ok = 0, fail = 0;
  results.forEach((r, i) => {
    if (r.success && r.rows > 0) { ok++; console.log(`✅ ${SAMPLES[i].name.split("（")[0]} → ${r.rows} 行数据`); }
    else if (r.success) { fail++; console.log(`⚠️  ${SAMPLES[i].name.split("（")[0]} → 0 行数据`); }
    else { fail++; console.log(`❌ ${SAMPLES[i].name.split("（")[0]} → 失败`); }
  });
  console.log(`\n结果: ${ok} 通过, ${fail} 异常 / ${SAMPLES.length}`);
}

main().catch(console.error);
