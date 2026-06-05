import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, "..", "samples");

const files = fs.readdirSync(samplesDir).filter(f => f.endsWith(".xlsx") || f.endsWith(".csv"));

async function analyze() {
  for (const file of files) {
    console.log("\n========== " + file + " ==========");
    try {
      if (file.endsWith(".xlsx")) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(path.join(samplesDir, file));
        console.log("Sheets:", wb.worksheets.length, wb.worksheets.map(s => s.name));
        for (const ws of wb.worksheets) {
          console.log("  Sheet [" + ws.name + "]: rows=" + ws.rowCount + ", cols=" + ws.columnCount);
          // 打印前15行
          for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
            const vals = [];
            for (let c = 1; c <= ws.columnCount; c++) {
              const v = ws.getCell(r, c).value;
              const s = v !== null && v !== undefined ? String(v).substring(0, 25) : "";
              vals.push(s);
            }
            const line = vals.join(" | ");
            if (line.trim()) console.log("    Row" + (r - 1) + ": " + line);
          }
        }
      } else if (file.endsWith(".csv")) {
        const content = fs.readFileSync(path.join(samplesDir, file), "utf-8");
        const lines = content.split("\n").slice(0, 15);
        lines.forEach((l, i) => console.log("    Row" + i + ": " + l.substring(0, 300)));
      }
    } catch (e) {
      console.log("  Error:", e.message);
    }
  }
}
analyze().catch(console.error);
