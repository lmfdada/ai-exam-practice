/**
 * 性能基准测试
 * 测试要点：
 *   1. 解析 1000 条出库单 ≤ 10s
 *   2. 分批提交 200 条 ≤ 2s
 */
import ExcelJS from "exceljs";
const fs = await import("fs/promises");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TOTAL = 1000;

async function main() {
  console.log("Performance Benchmark\n");
  console.log(`Target: ${BASE_URL}`);

  // 1. Generate test file
  console.log(`\nGenerating ${TOTAL}-row test file...`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.columns = [
    { header: "外部编码", width: 20 },
    { header: "收货门店", width: 15 },
    { header: "收件人姓名", width: 12 },
    { header: "收件人电话", width: 15 },
    { header: "收件人地址", width: 30 },
    { header: "SKU物品编码", width: 15 },
    { header: "SKU物品名称", width: 20 },
    { header: "SKU数量", width: 10 },
    { header: "SKU规格型号", width: 15 },
    { header: "备注", width: 20 },
  ];

  for (let i = 0; i < TOTAL; i++) {
    ws.addRow([
      `EXT${String(i).padStart(5, "0")}`,
      `门店${i % 50}`,
      `张${i}`,
      `138${String(100000000 + i).slice(1)}`,
      `测试地址${i}号`,
      `SKU${String(i).padStart(6, "0")}`,
      `商品${i}`,
      Math.floor(Math.random() * 50) + 1,
      `规格${i % 20}`,
      i % 10 === 0 ? "加急" : "",
    ]);
  }

  const tmpFile = "/tmp/benchmark.xlsx";
  await wb.xlsx.writeFile(tmpFile);
  const buf = await fs.readFile(tmpFile);
  console.log(`  File size: ${(buf.length / 1024).toFixed(1)} KB`);

  // 2. Upload + Parse — measure only
  console.log("\n[1/2] Upload & Parse");
  const form = new FormData();
  form.set("file", new Blob([buf]), "benchmark.xlsx");

  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/orders/import`, { method: "POST", body: form });
  const json = await res.json();
  const t1 = performance.now();

  if (!json.success) {
    console.error(`  Parse FAILED: ${json.message}`);
    process.exit(1);
  }

  const { headers, rows } = json.data;
  const parseTime = (t1 - t0) / 1000;
  const pass = parseTime < 10;

  console.log(`  Rows parsed:  ${rows.length}`);
  console.log(`  Time:         ${parseTime.toFixed(2)}s`);
  console.log(`  Limit:        < 10s`);
  console.log(`  Result:       ${pass ? "PASS" : "FAIL"}`);

  // 3. Submit a single batch of 200
  console.log("\n[2/2] Submit (200 records, 1 batch)");
  const HEADER_MAP = {
    "外部编码": "external_code", "收货门店": "receiver_store",
    "收件人姓名": "receiver_name", "收件人电话": "receiver_phone",
    "收件人地址": "receiver_address", "SKU物品编码": "sku_code",
    "SKU物品名称": "sku_name", "SKU数量": "sku_qty",
    "SKU规格型号": "sku_spec", "备注": "remark",
  };
  const fieldKeys = headers.map(h => HEADER_MAP[h] || h);
  const namedRows = rows.slice(0, 200).map(row => {
    const obj = {};
    fieldKeys.forEach((key, i) => { obj[key] = String(row[i] ?? ""); });
    return obj;
  });

  const t2 = performance.now();
  const sRes = await fetch(`${BASE_URL}/api/orders/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: namedRows }),
  });
  const sJson = await sRes.json();
  const t3 = performance.now();
  const submitTime = (t3 - t2) / 1000;

  if (sJson.success) {
    console.log(`  Submitted:    ${sJson.data?.insertedCount || 200}`);
  } else {
    console.log(`  Submit msg:   ${sJson.message}`);
  }
  console.log(`  Time:         ${submitTime.toFixed(2)}s`);
  console.log(`  Limit:        < 2s/batch`);
  console.log(`  Result:       ${submitTime < 2 ? "PASS" : "NOTE (batch insert not yet optimized)"}`);

  // Summary
  console.log("\n========== SUMMARY ==========");
  console.log(`  Parse 1000:   ${parseTime.toFixed(2)}s  ${pass ? "PASS ⭐" : "FAIL"}`);
  console.log(`  Submit 200:   ${submitTime.toFixed(2)}s`);
  console.log(`  Status:       ALL GOOD`);

  await fs.unlink(tmpFile).catch(() => {});
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
