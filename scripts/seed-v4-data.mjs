import ExcelJS from "exceljs";
import crypto from "node:crypto";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const count = Number(process.env.SKU_COUNT || 20000);
const rowCount = Number(process.env.ORDER_COUNT || 10000);
const adminToken = process.env.V4_ADMIN_TOKEN;

async function main() {
  const skuRows = Array.from({ length: count }, (_, index) => ({
    sku_code: `SKU_${String(index + 1).padStart(5, "0")}`,
    name: `压测商品 ${index + 1}`,
    spec: index % 2 ? "标准装" : "家庭装",
    unit: "件",
  }));
  const seedResponse = await fetch(`${baseUrl}/api/import-monitor/seed`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
    },
    body: JSON.stringify({ rows: skuRows }),
  });
  if (!seedResponse.ok) throw new Error(`SKU seed failed: ${seedResponse.status}`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("V4压测");
  sheet.addRow(["外部编码", "收货门店", "收件人姓名", "收件人电话", "收货地址", "SKU编码", "SKU名称", "数量", "规格"]);
  for (let index = 0; index < rowCount; index++) {
    const skuIndex = index % count;
    sheet.addRow([
      `V4_${Date.now()}_${String(index + 1).padStart(5, "0")}`,
      `压测门店 ${(index % 20) + 1}`,
      "压测用户",
      `138${String(10000000 + index).padStart(8, "0")}`,
      "测试地址",
      `SKU_${String(skuIndex + 1).padStart(5, "0")}`,
      `压测商品 ${skuIndex + 1}`,
      (index % 20) + 1,
      index % 2 ? "标准装" : "家庭装",
    ]);
  }
  const output = process.env.OUTPUT || "test-data/10000-orders.xlsx";
  await (await import("node:fs/promises")).mkdir("test-data", { recursive: true });
  await workbook.xlsx.writeFile(output);
  console.log(JSON.stringify({ skuCount: count, orderCount: rowCount, output, seedRequestId: crypto.randomUUID() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
