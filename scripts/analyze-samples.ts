import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

async function analyzeFile(filePath: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📄 文件: ${path.basename(filePath)}`);
  console.log("=".repeat(60));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  workbook.worksheets.forEach((worksheet, idx) => {
    console.log(`\n  📑 Sheet ${idx + 1}: "${worksheet.name}" (${worksheet.rowCount} 行 x ${worksheet.columnCount} 列)`);

    const merges = (worksheet as any).mergedCells?.ranges || [];
    if (merges.length > 0) {
      console.log(`   🔗 合并单元格: ${merges.map((m: any) => m.toString()).join(", ")}`);
    }

    for (let rowNum = 1; rowNum <= Math.min(worksheet.rowCount, 15); rowNum++) {
      const row = worksheet.getRow(rowNum);
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim().substring(0, 40) : "";
        values.push(`[${colNum}]${val}`);
      });
      const prefix = rowNum === 1 ? "   📌 表头" : `   ${rowNum.toString().padStart(2)}行`;
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
