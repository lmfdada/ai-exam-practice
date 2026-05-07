// ====================================
// 留言 CRUD 接口
// GET    /api/messages       → 查询所有留言
// POST   /api/messages       → 新增留言
// DELETE /api/messages?id=xx → 删除留言
// ====================================
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// 获取数据库连接
function getDb() {
  return neon(process.env.DATABASE_URL!);
}

// ✅ GET — 查询留言（分页）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));
    const offset = (page - 1) * pageSize;

    const sql = getDb();

    const countResult = await sql`SELECT COUNT(*) as total FROM messages`;
    const total = Number(countResult[0].total);

    const rows = await sql`
      SELECT * FROM messages ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json({ success: true, data: rows, total, page, pageSize });
  } catch (error) {
    console.error("查询留言失败:", error);
    return NextResponse.json(
      { success: false, message: "查询失败", error: String(error) },
      { status: 500 }
    );
  }
}

// ✅ POST — 新增留言
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { author, content } = body;

    // 参数校验
    if (!author || !content) {
      return NextResponse.json(
        { success: false, message: "作者和内容不能为空" },
        { status: 400 }
      );
    }

    const sql = getDb();
    const rows = await sql`
      INSERT INTO messages (author, content)
      VALUES (${author}, ${content})
      RETURNING *
    `;

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("新增留言失败:", error);
    return NextResponse.json(
      { success: false, message: "新增失败", error: String(error) },
      { status: 500 }
    );
  }
}

// ✅ DELETE — 删除留言
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "缺少留言 ID" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await sql`DELETE FROM messages WHERE id = ${id}`;

    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    console.error("删除留言失败:", error);
    return NextResponse.json(
      { success: false, message: "删除失败", error: String(error) },
      { status: 500 }
    );
  }
}
