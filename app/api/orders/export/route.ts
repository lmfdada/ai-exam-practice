import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { STANDARD_FIELDS } from "@/lib/orders";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = body as { rows: Record<string, unknown>[] };

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ success: false, message: "数据无效" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("运单数据");

    worksheet.columns = STANDARD_FIELDS.map((f) => ({
      header: f.label,
      key: f.key,
      width: f.key === "remark" ? 30 : f.key === "sender_address" || f.key === "receiver_address" ? 40 : 18,
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("导出失败:", error);
    return NextResponse.json({ success: false, message: "导出失败" }, { status: 500 });
  }
}
