import fs from "fs";
import path from "path";
import { Workbook } from "exceljs";

async function analyzeFile(filePath) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📄 文件: ${path.basename(filePath)}`);
  console.log("=".repeat(60));

  const workbook = new Workbook();
  await workbook.xlsx.readFile(filePath);

  workbook.worksheets.forEach((worksheet, idx) => {
    console.log(`\n  📑 Sheet ${idx + 1}: "${worksheet.name}" (${worksheet.rowCount} 行 x ${worksheet.columnCount} 列)`);

    for (let rowNum = 1; rowNum <= Math.min(worksheet.rowCount, 12); rowNum++) {
      const row = worksheet.getRow(rowNum);
      const values = [];
      for (let col = 1; col <= worksheet.columnCount; col++) {
        const cell = row.getCell(col);
        const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim().substring(0, 40) : "";
        if (val) values.push(`[${col}]${val}`);
      }
      const prefix = rowNum === 1 ? "📌 表头" : `${rowNum}`.padStart(2);
      console.log(`  ${prefix}: ${values.join(" | ")}`);
    }
  });
}

async function main() {
  const samplesDir = path.join(process.cwd(), "samples");
  const files = fs.readdirSync(samplesDir).filter((f) => f.endsWith(".xlsx"));

  for (const file of files) {
    await analyzeFile(path.join(samplesDir, file));
  }
}

main().catch(console.error);
