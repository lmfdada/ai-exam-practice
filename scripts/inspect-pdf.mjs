import { readFileSync } from "fs";
import path from "path";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { getData } = await import("pdf-parse/worker");
pdfjs.GlobalWorkerOptions.workerSrc = getData();

const fpath = path.join(process.cwd(), "samples", "黔寨寨贵州烙锅（鞍山店）常温.pdf");
const buf = readFileSync(fpath);
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
  const page = await doc.getPage(pageNum);
  const tc = await page.getTextContent();

  // 按 hasEOL 分组为行
  let currentLine = "";
  const lines = [];
  for (const item of tc.items) {
    if ("str" in item) {
      currentLine += item.str;
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = "";
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  console.log(`\n===== Page ${pageNum} (${lines.length} lines) =====`);
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    console.log(`L${i}: ${JSON.stringify(lines[i].slice(0, 250))}`);
  }
  if (lines.length > 10) {
    // 中间
    for (let i = Math.max(10, lines.length - 5); i < lines.length; i++) {
      console.log(`L${i}: ${JSON.stringify(lines[i].slice(0, 250))}`);
    }
  }
  page.cleanup();
}
await doc.destroy();
