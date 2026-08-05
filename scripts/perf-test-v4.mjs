import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const rowCount = Number(process.env.ORDER_COUNT || 10000);
const filePath = process.env.FILE || "test-data/10000-orders.xlsx";
const pollMs = Number(process.env.POLL_MS || 1000);
const deadlineMs = Number(process.env.DEADLINE_MS || 60000);

async function createFile() {
  try {
    return await fs.readFile(filePath);
  } catch {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("V4压测");
    sheet.addRow(["外部编码", "收货门店", "收件人姓名", "收件人电话", "收货地址", "SKU编码", "SKU名称", "数量", "规格"]);
    for (let index = 0; index < rowCount; index += 1) {
      const sku = `SKU_${String((index % 20000) + 1).padStart(5, "0")}`;
      sheet.addRow([
        `PERF_${Date.now()}_${String(index + 1).padStart(5, "0")}`,
        `压测门店 ${(index % 20) + 1}`,
        "压测用户",
        `138${String(10000000 + index).padStart(8, "0")}`,
        "压测地址",
        sku,
        `压测商品 ${(index % 20000) + 1}`,
        (index % 20) + 1,
        "标准装",
      ]);
    }
    await fs.mkdir("test-data", { recursive: true });
    await workbook.xlsx.writeFile(filePath);
    return fs.readFile(filePath);
  }
}

async function main() {
  const file = await createFile();
  const formData = new FormData();
  formData.append("file", new Blob([file]), filePath.split("/").pop());
  const uploadStarted = performance.now();
  const uploadResponse = await fetch(`${baseUrl}/api/import-tasks`, { method: "POST", body: formData });
  const uploadMs = performance.now() - uploadStarted;
  const uploadJson = await uploadResponse.json();
  if (!uploadResponse.ok || !uploadJson.success) throw new Error(uploadJson.message || `upload failed: ${uploadResponse.status}`);

  const taskId = uploadJson.data.task_id;
  const taskStarted = performance.now();
  let task;
  while (performance.now() - taskStarted < deadlineMs) {
    await fetch(`${baseUrl}/api/import-worker?limit=5`, { method: "POST" }).catch(() => null);
    const response = await fetch(`${baseUrl}/api/import-tasks/${taskId}`, { cache: "no-store" });
    const json = await response.json();
    task = json.data;
    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(task?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  const totalMs = performance.now() - taskStarted;
  const result = {
    taskId,
    uploadMs: Math.round(uploadMs),
    processingMs: Math.round(totalMs),
    status: task?.status,
    totalRows: task?.total_rows,
    processedRows: task?.processed_rows,
    successRows: task?.success_rows,
    failedRows: task?.failed_rows,
    uploadTargetMet: uploadMs <= 1000,
    targetMet: totalMs <= deadlineMs && task?.status !== "FAILED",
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.targetMet) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
