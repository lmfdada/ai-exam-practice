import { readFileSync } from "fs";
import path from "path";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { getData } = await import("pdf-parse/worker");
pdfjs.GlobalWorkerOptions.workerSrc = getData();

const fpath = path.join(process.cwd(), "samples", "黔寨寨贵州烙锅（鞍山店）常温.pdf");
const buf = readFileSync(fpath);
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

// 收集 page 1 的全部 items
const page = await doc.getPage(1);
const tc = await page.getTextContent();

// 按 y 分组
const yGroups = {};
for (const item of tc.items) {
  if ("str" in item && item.transform) {
    const y = Math.round(item.transform[5]);
    if (!yGroups[y]) yGroups[y] = [];
    yGroups[y].push({ str: item.str, x: item.transform[4], w: item.width });
  }
}

// 只看数据行区域（y 约 663 及以下）
const dataY = Object.keys(yGroups).map(Number).sort((a,b) => b-a);
for (const y of dataY.slice(0, 20)) {
  const items = yGroups[y].sort((a,b) => a.x - b.x);
  // 过滤掉纯空格
  const nonSpace = items.filter(i => i.str.trim());
  if (nonSpace.length >= 3) {
    console.log(`y=${y}: ${nonSpace.map(i => `${JSON.stringify(i.str)}@x=${i.x.toFixed(1)}(w=${i.w.toFixed(1)})`).join(" | ")}`);
  }
}

// 再检查最后一行的 header
console.log("\n=== Last rows (headers) ===");
const lastYs = dataY.slice(-10);
for (const y of lastYs) {
  const items = yGroups[y].sort((a,b) => a.x - b.x);
  const nonSpace = items.filter(i => i.str.trim());
  if (nonSpace.length >= 2) {
    console.log(`y=${y}: ${nonSpace.map(i => `${JSON.stringify(i.str)}@x=${i.x.toFixed(1)}`).join(" | ")}`);
  }
}

// 也看完整（含空格）的结构
console.log("\n=== ALL items at data y's (with spaces) ===");
for (const y of dataY.slice(0, 20)) {
  const items = yGroups[y].sort((a,b) => a.x - b.x);
  if (items.length >= 3) {
    console.log(`y=${y}: ${items.map(i => `${JSON.stringify(i.str)}(x=${i.x.toFixed(0)})`).join(" ")}`);
  }
}

await doc.destroy();
