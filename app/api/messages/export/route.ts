import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

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
