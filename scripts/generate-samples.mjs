/**
 * 生成额外的 3 个 Demo 样例文件：
 * 1. CSV 格式出库单
 * 2. DOCX 格式配送单
 * 3. XLSX 多格式混合（合并单元格 + 多 Sheet）
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle } from "docx";

const SAMPLES_DIR = path.resolve(import.meta.dirname, "..", "samples");

// ===================== 1. CSV 格式出库单 =====================
function generateCSV() {
  const headers = ["外部单号", "门店名称", "物品编码", "物品名称", "发货数量", "规格型号", "备注"];
  const rows = [
    ["PO2025001", "黎明屯（北京路店）", "SKU-88001", "纯棉圆领T恤（白色）", "50", "L", "加急配送"],
    ["PO2025001", "黎明屯（北京路店）", "SKU-88002", "纯棉圆领T恤（黑色）", "30", "XL", ""],
    ["PO2025001", "黎明屯（北京路店）", "SKU-88003", "牛仔直筒裤（深蓝）", "20", "32码", "加急配送"],
    ["PO2025002", "湖南仓（长沙总仓）", "SKU-77001", "腊味礼盒", "100", "500g", "春节备货"],
    ["PO2025002", "湖南仓（长沙总仓）", "SKU-77002", "剁椒酱", "200", "300ml", "春节备货"],
    ["PO2025002", "湖南仓（长沙总仓）", "SKU-77003", "湖南米粉", "150", "1kg", ""],
    ["PO2025003", "欢乐牧场（旗舰店）", "SKU-66001", "烤羊腿料包", "80", "200g", ""],
    ["PO2025003", "欢乐牧场（旗舰店）", "SKU-66002", "蒙古奶茶粉", "60", "400g", "新品尝鲜"],
    ["PO2025004", "黔寨寨贵州烙锅（鞍山店）", "SKU-55001", "贵州辣椒面", "120", "250g", ""],
    ["PO2025004", "黔寨寨贵州烙锅（鞍山店）", "SKU-55002", "手撕豆腐", "90", "500g", "冷藏运输"],
  ];

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const filePath = path.join(SAMPLES_DIR, "批量出库单-标准CSV格式.csv");
  fs.writeFileSync(filePath, csvContent, "utf-8");
  console.log(`✅ 已创建: ${filePath}`);
}

// ===================== 2. DOCX 格式配送单 =====================
async function generateDOCX() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "SimSun", size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: "配 送 发 货 单", bold: true, size: 36 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "配送单号：PS20250605001    日期：2025-06-05", size: 22 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "发货方：贵阳总仓    收货方：黎明屯（北京路店）", size: 22 })],
            spacing: { after: 200 },
          }),
          new Paragraph({ spacing: { after: 100 } }),
          ...generateTableRows(),
          new Paragraph({ spacing: { after: 200 } }),
          new Paragraph({
            children: [
              new TextRun({ text: "备注：", bold: true }),
              new TextRun("本单共 3 种物品，合计 100 件，请仔细核对后签收。"),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({ spacing: { after: 400 } }),
          new Paragraph({
            children: [new TextRun("发货人签字：____________    收货人签字：____________    日期：____________")],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(SAMPLES_DIR, "配送发货单-DOCX格式.docx");
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ 已创建: ${filePath}`);
}

function generateTableRows() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ["序号", "物品编码", "物品名称", "规格型号", "单位", "数量", "备注"].map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text, bold: true, size: 22 })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: text === "物品名称" ? 3000 : 1500, type: WidthType.DXA },
          shading: { fill: "E8F5FE", type: "clear" },
        })
    ),
  });

  const dataRows = [
    ["1", "SKU-88001", "纯棉圆领T恤（白色）", "L", "件", "50", ""],
    ["2", "SKU-88002", "纯棉圆领T恤（黑色）", "XL", "件", "30", ""],
    ["3", "SKU-88003", "牛仔直筒裤（深蓝）", "32码", "条", "20", "加急"],
  ];

  const dataRowEls = dataRows.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (text) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text, size: 22 })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              width: { size: 1500, type: WidthType.DXA },
            })
        ),
      })
  );

  return [new Table({ rows: [headerRow, ...dataRowEls] })];
}

// ===================== 3. XLSX 多 Sheet 出库单 =====================
async function generateXLSX() {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: 汇总信息（合并单元格）
  const summarySheet = workbook.addWorksheet("汇总信息");
  summarySheet.mergeCells("A1:D1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = "多门店配送发货汇总（示例）";
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A73E8" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summarySheet.getRow(1).height = 36;

  summarySheet.mergeCells("A2:D2");
  summarySheet.getCell("A2").value = "制单日期：2025-06-05    共计 3 个门店";
  summarySheet.getCell("A2").alignment = { horizontal: "center" };
  summarySheet.getRow(2).height = 24;

  // 汇总表头
  summarySheet.getCell("A4").value = "门店名称";
  summarySheet.getCell("B4").value = "物品总数（件）";
  summarySheet.getCell("C4").value = "SKU种类";
  summarySheet.getCell("D4").value = "备注";
  ["A4", "B4", "C4", "D4"].forEach((ref) => {
    const cell = summarySheet.getCell(ref);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF34A853" } };
    cell.alignment = { horizontal: "center" };
  });

  const summaryData = [
    ["黎明屯（北京路店）", 100, 3, ""],
    ["湖南仓（长沙总仓）", 450, 5, "含冷链品"],
    ["欢乐牧场（旗舰店）", 80, 2, "新品尝鲜"],
  ];
  summaryData.forEach((row, i) => {
    const r = i + 5;
    row.forEach((val, j) => {
      summarySheet.getCell(r, j + 1).value = val;
    });
  });

  summarySheet.columns = [
    { width: 24 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
  ];

  // Sheet 2: 黎明屯明细
  const detail1 = workbook.addWorksheet("黎明屯明细");
  detail1.addRow(["外部单号", "物品编码", "物品名称", "规格型号", "数量", "备注"]);
  detail1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detail1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4285F4" } };
  detail1.addRows([
    ["PO2025001", "SKU-88001", "纯棉圆领T恤（白色）", "L", 50, ""],
    ["PO2025001", "SKU-88002", "纯棉圆领T恤（黑色）", "XL", 30, ""],
    ["PO2025001", "SKU-88003", "牛仔直筒裤（深蓝）", "32码", 20, "加急"],
  ]);
  detail1.columns = [{ width: 16 }, { width: 18 }, { width: 24 }, { width: 12 }, { width: 10 }, { width: 12 }];

  // Sheet 3: 湖南仓明细
  const detail2 = workbook.addWorksheet("湖南仓明细");
  detail2.addRow(["外部单号", "物品编码", "物品名称", "规格型号", "数量", "备注"]);
  detail2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  detail2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA4335" } };
  detail2.addRows([
    ["PO2025002", "SKU-77001", "腊味礼盒", "500g", 100, "春节备货"],
    ["PO2025002", "SKU-77002", "剁椒酱", "300ml", 200, "春节备货"],
    ["PO2025002", "SKU-77003", "湖南米粉", "1kg", 150, ""],
  ]);
  detail2.columns = [{ width: 16 }, { width: 18 }, { width: 24 }, { width: 12 }, { width: 10 }, { width: 12 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filePath = path.join(SAMPLES_DIR, "多门店汇总-多Sheet出库单.xlsx");
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ 已创建: ${filePath}`);
}

// ===================== 执行 =====================
async function main() {
  console.log("🚀 开始生成 Demo 样例文件...\n");
  generateCSV();
  await generateDOCX();
  await generateXLSX();

  // 列出最终文件列表
  console.log("\n📂 samples/ 目录文件列表：");
  const files = fs.readdirSync(SAMPLES_DIR).sort();
  files.forEach((f, i) => {
    const stat = fs.statSync(path.join(SAMPLES_DIR, f));
    const size = (stat.size / 1024).toFixed(1);
    console.log(`  ${i + 1}. ${f} (${size} KB)`);
  });
  console.log(`\n✅ 共计 ${files.length} 个 Demo 文件`);
}

main().catch(console.error);
