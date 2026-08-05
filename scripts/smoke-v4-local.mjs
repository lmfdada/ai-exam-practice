import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const port = Number(process.env.PORT || 3025);
const baseUrl = `http://127.0.0.1:${port}`;
const rows = Number(process.env.SMOKE_ROWS || 50);

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("dev server did not become reachable");
}

async function createSmokeFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("smoke");
  sheet.addRow(["外部编码", "收货门店", "收件人姓名", "收件人电话", "收货地址", "SKU编码", "SKU名称", "数量", "规格"]);
  for (let index = 0; index < rows; index += 1) {
    sheet.addRow([
      `SMOKE_${Date.now()}_${index + 1}`,
      "测试门店",
      "测试用户",
      `138${String(20000000 + index).padStart(8, "0")}`,
      "测试地址",
      `SKU_${String((index % 20000) + 1).padStart(5, "0")}`,
      "测试商品",
      1,
      "标准装",
    ]);
  }
  await fs.mkdir("test-data", { recursive: true });
  const file = `test-data/smoke-${Date.now()}.xlsx`;
  await workbook.xlsx.writeFile(file);
  return file;
}

async function runSmoke() {
  await waitForServer();
  const filePath = await createSmokeFile();
  const file = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([file]), filePath.split("/").pop());
  const upload = await fetch(`${baseUrl}/api/import-tasks`, { method: "POST", body: formData });
  const created = await upload.json();
  if (!created.success) throw new Error(created.message || "create task failed");
  const taskId = created.data.task_id;
  let task = created.data;
  for (let index = 0; index < 20; index += 1) {
    await fetch(`${baseUrl}/api/import-worker?limit=5`, { method: "POST" });
    const response = await fetch(`${baseUrl}/api/import-tasks/${taskId}`, { cache: "no-store" });
    const json = await response.json();
    task = json.data;
    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(JSON.stringify({ taskId, status: task.status, totalRows: task.total_rows, processedRows: task.processed_rows, successRows: task.success_rows, failedRows: task.failed_rows }, null, 2));
  if (task.status === "FAILED" || task.processed_rows !== rows) process.exitCode = 2;
}

const child = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

runSmoke()
  .finally(() => child.kill("SIGTERM"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
