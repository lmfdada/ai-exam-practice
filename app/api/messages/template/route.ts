import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("留言模板");

    worksheet.columns = [
      { header: "作者", key: "author", width: 25 },
      { header: "内容", key: "content", width: 60 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    for (let i = 2; i <= 11; i++) {
      const row = worksheet.getRow(i);
      row.getCell(1).border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      row.getCell(2).border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="messages_template.xlsx"',
      },
    });
  } catch (error) {
    console.error("模板生成失败:", error);
    return NextResponse.json(
      { success: false, message: "模板生成失败", error: String(error) },
      { status: 500 }
    );
  }
}
