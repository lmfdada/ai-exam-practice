import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import ExcelJS from "exceljs";

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    const sql = getDb();
    const rows = await sql`
      SELECT id, author, content, created_at FROM messages ORDER BY created_at DESC
    `;

    if (format === "csv") {
      const headers = "ID,作者,内容,创建时间\n";
      const csvRows = rows
        .map(
          (row: Record<string, unknown>) =>
            `${row.id},"${String(row.author).replace(/"/g, '""')}","${String(row.content).replace(/"/g, '""')}",${row.created_at}`
        )
        .join("\n");
      const csv = headers + csvRows;

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="messages_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("留言板");

      worksheet.columns = [
        { header: "ID", key: "id", width: 8 },
        { header: "作者", key: "author", width: 20 },
        { header: "内容", key: "content", width: 60 },
        { header: "创建时间", key: "created_at", width: 25 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF6366F1" },
      };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };

      rows.forEach((row: Record<string, unknown>) => {
        worksheet.addRow({
          id: row.id,
          author: row.author,
          content: row.content,
          created_at: row.created_at,
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="messages_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    return NextResponse.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="messages_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("导出失败:", error);
    return NextResponse.json(
      { success: false, message: "导出失败", error: String(error) },
      { status: 500 }
    );
  }
}
