import { readFileSync } from "fs";
import path from "path";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { getData } = await import("pdf-parse/worker");
pdfjs.GlobalWorkerOptions.workerSrc = getData();

const fpath = path.join(process.cwd(), "samples", "黔寨寨贵州烙锅（鞍山店）常温.pdf");
const buf = readFileSync(fpath);
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

const page = await doc.getPage(1);
const tc = await page.getTextContent();

// 按 hasEOL 分行
const lines = [];
let curr = [];
for (const item of tc.items) {
  if ("str" in item && item.transform) {
    curr.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
    if (item.hasEOL) {
      lines.push(curr.sort((a,b) => a.x - b.x));
      curr = [];
    }
  }
}
if (curr.length) lines.push(curr);

// 显示每一行的 items
for (let i = 0; i < lines.length; i++) {
  const items = lines[i];
  const text = items.map(i => i.str).join(" ").trim();
  if (!text) continue;
  console.log(`Line ${i} (${items.length} items, y≈${items[0].y.toFixed(1)}):`);
  for (const item of items) {
    console.log(`  [x=${item.x.toFixed(1)}] ${JSON.stringify(item.str)}`);
  }
  // 计算间隙
  if (items.length > 1) {
    const gaps = [];
    for (let j = 1; j < items.length; j++) {
      gaps.push(items[j].x - items[j-1].x);
    }
    const avg = gaps.reduce((a,b) => a+b, 0) / gaps.length;
    const threshold = Math.max(avg * 0.5, 15);
    console.log(`  gaps: [${gaps.map(g => g.toFixed(1)).join(", ")}] avg=${avg.toFixed(1)} threshold=${threshold.toFixed(1)}`);
    
    // 按阈值分列
    const cells = [];
    let buf = items[0].str;
    for (let j = 1; j < items.length; j++) {
      if (items[j].x - items[j-1].x < threshold) {
        buf += items[j].str;
      } else {
        cells.push(buf);
        buf = items[j].str;
      }
    }
    cells.push(buf);
    console.log(`  cells: [${cells.join(" | ")}]`);
  }
}

await doc.destroy();
