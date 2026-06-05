import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { STANDARD_FIELDS } from "@/lib/orders";

// 导出自定义字段（不在标准字段表中但需要导出）
const EXTRA_EXPORT_FIELDS = [
  { key: "submitted_at", label: "提交时间", width: 20 },
  { key: "status", label: "状态", width: 12 },
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = body as { rows: Record<string, unknown>[] };

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ success: false, message: "数据无效" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("运单数据");

    const allColumns = [
      ...STANDARD_FIELDS.map((f) => ({
        header: f.label,
        key: f.key,
        width: f.key === "remark" ? 30 : f.key === "receiver_address" ? 40 : 18,
      })),
      ...EXTRA_EXPORT_FIELDS.map((f) => ({
        header: f.label,
        key: f.key,
        width: f.width,
      })),
    ];

    worksheet.columns = allColumns;

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    rows.forEach((row) => {
      worksheet.addRow({
        ...row,
        submitted_at: row.created_at
          ? new Date(row.created_at as string).toLocaleString("zh-CN", { hour12: false })
          : "-",
        status: "已提交",
      });
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
