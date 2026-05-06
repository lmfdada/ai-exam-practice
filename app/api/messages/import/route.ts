import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { author: string; content: string }[] {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const hasHeader =
    headerLine.includes("作者") ||
    headerLine.includes("author") ||
    headerLine.includes("内容") ||
    headerLine.includes("content");

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const records: { author: string; content: string }[] = [];

  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    if (cols.length >= 2) {
      const author = (cols[0] || "").trim();
      const content = (cols[1] || "").trim();
      if (author && content) {
        records.push({ author, content });
      }
    }
  }

  return records;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "请上传文件" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const fileName = file.name.toLowerCase();
    let records: { author: string; content: string }[] = [];

    if (fileName.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        records = parsed
          .map((item) => ({
            author: String(item.author || item.name || "").trim(),
            content: String(item.content || item.message || item.text || "").trim(),
          }))
          .filter((r) => r.author && r.content);
      } else {
        return NextResponse.json(
          { success: false, message: "JSON 格式错误，需要数组格式" },
          { status: 400 }
        );
      }
    } else if (fileName.endsWith(".csv")) {
      records = parseCSV(text);
    } else {
      return NextResponse.json(
        { success: false, message: "仅支持 .json 和 .csv 文件" },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, message: "文件中没有有效的留言数据" },
        { status: 400 }
      );
    }

    const sql = getDb();
    let imported = 0;
    let skipped = 0;

    for (const record of records) {
      const existing = await sql`
        SELECT id FROM messages
        WHERE author = ${record.author} AND content = ${record.content}
        LIMIT 1
      `;

      if (existing.length === 0) {
        await sql`
          INSERT INTO messages (author, content)
          VALUES (${record.author}, ${record.content})
        `;
        imported++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `导入完成：成功 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条重复数据` : ""}`,
      data: { imported, skipped },
    });
  } catch (error) {
    console.error("导入失败:", error);
    return NextResponse.json(
      { success: false, message: "导入失败，请检查文件格式", error: String(error) },
      { status: 500 }
    );
  }
}
