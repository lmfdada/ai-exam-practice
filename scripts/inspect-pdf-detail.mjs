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

// 检查前 30 个 text item 的详情
for (let i = 0; i < Math.min(tc.items.length, 40); i++) {
  const item = tc.items[i];
  if ("str" in item) {
    console.log(`[${i}] str=${JSON.stringify(item.str.slice(0,30))} x=${item.transform?.[4]} y=${item.transform?.[5]} hasEOL=${item.hasEOL} width=${item.width}`);
  }
}

// 看完整拼接（用空格）后的样子
console.log("\n=== CONCATENATED (space) ===");
let s = "";
for (const item of tc.items) {
  if ("str" in item) {
    s += item.str + " ";
  }
}
console.log(s.slice(0, 1000));

// 看按 EOL 分行的样子  
console.log("\n=== EOL LINES ===");
let curr = "";
let lineCount = 0;
for (const item of tc.items) {
  if ("str" in item) {
    curr += item.str;
    if (item.hasEOL) {
      if (lineCount < 20) console.log(`L${lineCount}: ${JSON.stringify(curr.slice(0,200))} (len=${curr.length})`);
      curr = "";
      lineCount++;
    }
  }
}
console.log(`Total lines: ${lineCount}`);

await doc.destroy();
