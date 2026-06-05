import ExcelJS from "exceljs";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(__dirname, "../samples");

const files = fs.readdirSync(samplesDir).filter(f => !f.startsWith("."));

for (const file of files.sort()) {
  const filePath = path.join(samplesDir, file);
  const ext = path.extname(file).toLowerCase();
  const size = fs.statSync(filePath).size;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📄 ${file} (${(size / 1024).toFixed(1)} KB)`);
  console.log(`${"=".repeat(80)}`);

  try {
    if (ext === ".xlsx" || ext === ".xls") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      console.log(`  She工作簿: ${workbook.worksheets.length} 个工作表`);
      
      for (const ws of workbook.worksheets) {
        console.log(`\n  📋 Sheet: "${ws.name}" (行: ${ws.rowCount}, 列: ${ws.columnCount})`);

        // 读取前20行
        const rows = [];
        ws.eachRow((row, rowNum) => {
          if (rowNum <= 20) {
            const cells = [];
            row.eachCell((cell) => {
              cells.push(cell.value !== null && cell.value !== undefined ? String(cell.value).slice(0, 30) : "");
            });
            rows.push(cells);
          }
        });

        // 检测可能的表头行
        const KNOWN_HEADER_KEYWORDS = [
          "编码", "名称", "数量", "门店", "地址", "电话", "手机", "姓名",
          "SKU", "规格", "备注", "单号", "订单", "配送", "收货",
          "序号", "编号", "货号", "品名", "物料", "仓库",
        ];

        let bestRow = 0;
        let bestScore = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          let score = 0;
          for (const cell of rows[i]) {
            const s = String(cell || "").trim();
            if (s.length > 10) continue;
            for (const kw of KNOWN_HEADER_KEYWORDS) {
              if (s.includes(kw)) { score++; break; }
            }
            if (s.length > 0 && s.length <= 15) score += 0.5;
          }
          if (score > bestScore) { bestScore = score; bestRow = i; }
        }

        console.log(`  📊 检测到的表头行: #${bestRow + 1} (得分: ${bestScore})`);
        if (rows[bestRow]) {
          console.log(`  📊 表头: [${rows[bestRow].map(h => `"${h}"`).join(", ")}]`);
        }

        // 打印前8行
        console.log(`  📋 前${Math.min(8, rows.length)}行预览:`);
        for (let i = 0; i < Math.min(8, rows.length); i++) {
          console.log(`    [${rows[i].map(c => (c || "—").padEnd(12)).join(" | ")}]`);
        }

        // 合并单元格信息
        if (ws.mergeCount > 0) {
          console.log(`  🔗 合并单元格: ${ws.mergeCount} 个`);
          const merges = ws.merges.slice(0, 5);
          for (const m of merges) {
            console.log(`    ${m.model?.master || JSON.stringify(m)}`);
          }
        }
      }
    } else if (ext === ".docx") {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;
      console.log(`  📝 文本内容 (前500字符):`);
      console.log(`    ${text.slice(0, 500).replace(/\n/g, "\n    ")}`);
    } else if (ext === ".pdf") {
      const { PDFParse } = await import("pdf-parse");
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      const text = textResult.text;
      await parser.destroy();
      console.log(`  📝 文本内容 (前500字符):`);
      console.log(`    ${text.slice(0, 500).replace(/\n/g, "\n    ")}`);
    }
  } catch (err) {
    console.log(`  ❌ 读取失败: ${err.message}`);
  }
}
