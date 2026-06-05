import { readFileSync, writeFileSync } from "fs";
import path from "path";

const BASE = "http://localhost:3000/api/orders/import";
const SAMPLES_DIR = path.resolve(process.cwd(), "samples");

const rules = {
  "门店调拨单-卡片式.xlsx": {
    id: "test-card",
    name: "卡片提取",
    fileTypes: ["xlsx"],
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
              { field: "receiver_store", rowOffset: -2, keyword: "调入门店" },
              { field: "receiver_name", rowOffset: -2, keyword: "收货人" },
              { field: "receiver_phone", rowOffset: -2, keyword: "电话" },
              { field: "receiver_address", rowOffset: -1, keyword: "收货地址" },
            ],
          },
        },
      ],
    },
  },
  "多门店分Sheet出库单.xlsx": {
    id: "test-multisheet",
    name: "多门店Sheet填充",
    fileTypes: ["xlsx"],
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
        {
          type: "fill_from_source_name",
          config: { targetField: "receiver_store" },
        },
      ],
    },
  },
  "欢乐牧场模板0430.xlsx": {
    id: "test-matrix",
    name: "矩阵转置",
    fileTypes: ["xlsx"],
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

async function testFile(filename, ruleDef) {
  const filepath = path.join(SAMPLES_DIR, filename);
  const buffer = readFileSync(filepath);

  const formData = new FormData();
  const blob = new Blob([buffer]);
  formData.append("file", blob, filename);
  if (ruleDef) {
    formData.append("rule", JSON.stringify(ruleDef));
  }

  const res = await fetch(BASE, { method: "POST", body: formData });
  const data = await res.json();

  console.log(`\n===== ${filename} =====`);
  console.log(`Success: ${data.success}`);
  if (data.success) {
    console.log(`Row count: ${data.data.rowCount}`);
    console.log(`Headers (${data.data.headers.length}): ${JSON.stringify(data.data.headers)}`);
    console.log(`Mapping: ${JSON.stringify(data.data.mapping)}`);
    const rows = data.data.rows;
    if (rows.length > 0) {
      console.log("--- First 3 rows (non-empty fields) ---");
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const r = rows[i];
        const filtered = {};
        for (const k of Object.keys(r)) {
          if (r[k]) filtered[k] = r[k].length > 30 ? r[k].slice(0, 28) + "..." : r[k];
        }
        console.log(`Row ${i}: ${JSON.stringify(filtered)}`);
      }
    }
  } else {
    console.log(`Error: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  // Test basic files (no rule)
  console.log("\n********** BASIC FILES (NO RULE) **********");
  await testFile("湖南仓.xlsx", null);
  await testFile("12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx", null);

  // Test card file without rule first
  console.log("\n********** CARD FILE (NO RULE) **********");
  await testFile("门店调拨单-卡片式.xlsx", null);

  // Test with rules
  console.log("\n********** WITH RULES **********");
  await testFile("门店调拨单-卡片式.xlsx", rules["门店调拨单-卡片式.xlsx"]);
  await testFile("多门店分Sheet出库单.xlsx", rules["多门店分Sheet出库单.xlsx"]);
  await testFile("欢乐牧场模板0430.xlsx", rules["欢乐牧场模板0430.xlsx"]);

  // Test PDF
  console.log("\n********** PDF **********");
  await testFile("黔寨寨贵州烙锅（鞍山店）常温.pdf", null);
}

main().catch(console.error);
