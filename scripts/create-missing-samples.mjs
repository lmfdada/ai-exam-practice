/**
 * 创建缺失的样本文件
 * 1. 周配送计划（复合单元格）- 使用 composite_split 处理
 * 2. 多单PDF配送签收单（多单PDF）- 使用 pdf-parse
 */
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, "..", "samples");

// ===== 1. 周配送计划（复合单元格）.xlsx =====
// 复合单元格格式：单列中包含 "物品编码/名称/规格" 等多段信息
async function createWeeklyPlan() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("周配送计划");

  // 头部信息
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "周配送计划（2026年第23周）";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = "配送日期：2026-06-01 ~ 2026-06-07  制单：武汉配送中心";
  ws.getCell("A2").alignment = { horizontal: "center" };

  // 表头行
  ws.getCell("A3").value = "门店名称";
  ws.getCell("B3").value = "配送商品（编码/名称/规格/数量）";
  ws.getCell("C3").value = "备注";
  ws.getCell("D3").value = "预计送达";
  ws.getCell("E3").value = "配送路线";
  ws.getCell("F3").value = "配送员";
  // 表头样式
  for (let c = 1; c <= 6; c++) {
    const cell = ws.getCell(3, c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  }

  // 数据行 - 复合单元格格式（多个商品信息在一个单元格中）
  const data = [
    ["黎明屯（北京路店）", "SKU-88001/纯棉圆领T恤（白色）/L/50|SKU-88002/纯棉圆领T恤（黑色）/XL/30|SKU-88003/牛仔直筒裤（深蓝）/32码/20", "加急配送", "2026-06-02", "A线", "张三"],
    ["湖南仓（长沙总仓）", "SKU-77001/腊味礼盒/500g/100|SKU-77002/剁椒酱/300ml/200|SKU-77003/湖南米粉/1kg/150", "含冷链品", "2026-06-02", "B线", "李四"],
    ["欢乐牧场（旗舰店）", "SKU-66001/烤羊腿料包/200g/80|SKU-66002/蒙古奶茶粉/400g/60", "新品尝鲜", "2026-06-03", "C线", "王五"],
    ["尹三顺（银泰店）", "ZBWP0001/茶语柠听紫苏风味糖浆/750ml*6瓶/件/3|ZBWP0015/寨寨香肠片/2.5kg*6包/件/5", "正常配送", "2026-06-01", "A线", "张三"],
    ["尹三顺（金桥店）", "ZBWP0025/麻辣折耳根脆/1.5kg*6包/件/2|ZBWP0028/Q寨寨五常香米/25kg/包/10|ZBWP0030/精品五花肉卷/10kg/件/4", "", "2026-06-01", "A线", "张三"],
  ];

  data.forEach((row, i) => {
    const rowNum = i + 4;
    row.forEach((val, j) => {
      ws.getCell(rowNum, j + 1).value = val;
      ws.getCell(rowNum, j + 1).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
  });

  // 设置列宽
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 55;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 10;

  const filePath = path.join(samplesDir, "周配送计划-复合单元格.xlsx");
  await wb.xlsx.writeFile(filePath);
  console.log(`✅ 已创建: 周配送计划-复合单元格.xlsx`);
}

// ===== 2. 多单PDF配送签收单 =====
// 使用 PDFKit 创建多单PDF
async function createMultiOrderPDF() {
  try {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 30 });
    const filePath = path.join(samplesDir, "多单配送签收单-多单PDF.pdf");
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 生成3个配送单
    const orders = [
      { id: "PS20260605001", store: "黎明屯（北京路店）", date: "2026-06-05", items: [
        ["SKU-88001", "纯棉圆领T恤（白色）", "L", "50"],
        ["SKU-88002", "纯棉圆领T恤（黑色）", "XL", "30"],
        ["SKU-88003", "牛仔直筒裤（深蓝）", "32码", "20"],
      ]},
      { id: "PS20260605002", store: "欢乐牧场（旗舰店）", date: "2026-06-05", items: [
        ["SKU-66001", "烤羊腿料包", "200g", "80"],
        ["SKU-66002", "蒙古奶茶粉", "400g", "60"],
      ]},
      { id: "PS20260605003", store: "湖南仓（长沙总仓）", date: "2026-06-05", items: [
        ["SKU-77001", "腊味礼盒", "500g", "100"],
        ["SKU-77002", "剁椒酱", "300ml", "200"],
      ]},
    ];

    orders.forEach((order, idx) => {
      if (idx > 0) doc.addPage();

      // 标题
      doc.fontSize(18).font("Helvetica-Bold").text("配 送 签 收 单", { align: "center" });
      doc.moveDown(0.5);

      // 单号/日期
      doc.fontSize(11).font("Helvetica");
      doc.text(`配送单号：${order.id}    日期：${order.date}`, { align: "left" });
      doc.text(`收货门店：${order.store}`, { align: "left" });
      doc.moveDown(0.5);

      // 表头
      const tableTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      const colX = [30, 150, 280, 380, 460];
      const headers = ["序号", "物品编码", "物品名称", "规格", "数量"];
      headers.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: 100 }));
      doc.moveDown(0.3);

      // 分隔线
      doc.moveTo(30, doc.y).lineTo(550, doc.y).stroke();

      // 数据行
      doc.font("Helvetica").fontSize(9);
      order.items.forEach((item, i) => {
        doc.text(String(i + 1), colX[0], doc.y + 4, { width: 40 });
        doc.text(item[0], colX[1], doc.y, { width: 100 });
        doc.text(item[1], colX[2], doc.y, { width: 80 });
        doc.text(item[2], colX[3], doc.y, { width: 60 });
        doc.text(item[3], colX[4], doc.y, { width: 40 });
        doc.moveDown(0.8);
      });

      // 合计
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(9);
      const totalQty = order.items.reduce((s, item) => s + parseInt(item[3]), 0);
      doc.text(`本单共 ${order.items.length} 种物品，合计 ${totalQty} 件`, 30, doc.y);

      // 签收栏
      doc.moveDown(2);
      doc.font("Helvetica").fontSize(10);
      doc.text("发货人签字：____________    收货人签字：____________    日期：____________");
    });

    doc.end();
    stream.on("finish", () => {
      console.log(`✅ 已创建: 多单配送签收单-多单PDF.pdf`);
    });
    await new Promise((resolve) => stream.on("finish", resolve));
  } catch (e) {
    console.log(`⚠️ 创建多单PDF失败: ${e.message}（可能需要安装 pdfkit）`);
  }
}

async function main() {
  await createWeeklyPlan();
  await createMultiOrderPDF();
  console.log("\n样本文件创建完毕！");
}

main().catch(console.error);
