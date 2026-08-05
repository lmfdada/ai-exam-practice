import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const port = Number(process.env.PORT || 3026);
const baseUrl = `http://127.0.0.1:${port}`;
const testFile = `test-data/regression-${Date.now()}.xlsx`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("dev server did not become reachable");
}

async function createRegressionFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("regression");
  sheet.addRow(["外部编码", "收货门店", "收件人姓名", "收件人电话", "收货地址", "SKU编码", "SKU名称", "数量", "规格", "温层"]);
  sheet.addRow(["REG_1", "测试门店", "", "", "", "SKU_REG_1", "测试商品", 1, "标准装", "常温"]);
  sheet.addRow(["REG_2", "测试门店", "测试用户", "13812345678", "北京市朝阳区测试路99号", "SKU_REG_2", "测试商品", 1, "标准装", "室温"]);
  await fs.mkdir("test-data", { recursive: true });
  await workbook.xlsx.writeFile(testFile);
}

async function upload(fileName, contents) {
  const formData = new FormData();
  formData.append("file", new Blob([contents]), fileName);
  return fetch(`${baseUrl}/api/import-tasks`, { method: "POST", body: formData });
}

async function runRegression() {
  await waitForServer();

  const unsupported = await upload("unsupported.txt", "not an import file");
  const unsupportedJson = await unsupported.json();
  assert(unsupported.status === 400 && !unsupportedJson.success, "unsupported extension should be rejected");

  await createRegressionFile();
  const file = await fs.readFile(testFile);
  const uploadResponse = await upload(testFile.split("/").pop(), file);
  const uploadJson = await uploadResponse.json();
  assert(uploadResponse.status === 202 && uploadJson.success, "regression task should be accepted");

  const taskId = uploadJson.data.task_id;
  let task = uploadJson.data;
  for (let index = 0; index < 20; index += 1) {
    await fetch(`${baseUrl}/api/import-worker?limit=5`, { method: "POST" });
    const response = await fetch(`${baseUrl}/api/import-tasks/${taskId}`, { cache: "no-store" });
    const json = await response.json();
    task = json.data;
    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(task?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert(task.status === "PARTIAL_SUCCESS", `expected partial success, got ${task.status}`);
  assert(task.total_rows === 2 && task.processed_rows === 2, "task progress should reconcile to two rows");
  assert(task.success_rows === 1 && task.failed_rows === 1, "one row should succeed and one row should fail");
  assert(task.errors?.length === 1, "one row-level error should be returned");
  assert(task.errors[0].raw_value.includes("138****5678"), "phone should be masked in error payload");
  assert(task.errors[0].raw_value.includes("北京市朝阳区***"), "address should be masked in error payload");

  await fetch(`${baseUrl}/api/import-worker?limit=5`, { method: "POST" });
  const afterSecondWorker = await (await fetch(`${baseUrl}/api/import-tasks/${taskId}`, { cache: "no-store" })).json();
  assert(afterSecondWorker.data.processed_rows === 2, "re-consuming an already sent event must not change progress");

  const batches = await (await fetch(`${baseUrl}/api/import-tasks/${taskId}/batches`)).json();
  assert(batches.success && batches.data.batches.length === 1, "one completed batch should be recorded");
  assert(batches.data.batches[0].status === "COMPLETED", "batch should be completed");

  console.log(JSON.stringify({
    taskId,
    status: afterSecondWorker.data.status,
    totalRows: afterSecondWorker.data.total_rows,
    processedRows: afterSecondWorker.data.processed_rows,
    successRows: afterSecondWorker.data.success_rows,
    failedRows: afterSecondWorker.data.failed_rows,
    checks: ["extension validation", "partial success", "sensitive masking", "idempotent re-consume"],
  }, null, 2));
}

const child = spawn(
  "npm",
  ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)],
  {
    env: { ...process.env, DATABASE_URL: "", NODE_ENV: "development", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

runRegression()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => child.kill("SIGTERM"));
