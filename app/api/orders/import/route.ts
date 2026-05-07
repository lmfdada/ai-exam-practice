import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { autoDetectMapping, computeFingerprint } from "@/lib/orders";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "请上传文件" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, message: `文件过大，最大支持 10MB` },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, message: "仅支持 .xlsx / .xls 文件" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json(
        { success: false, message: "Excel 文件中没有工作表" },
        { status: 400 }
      );
    }

    if (worksheet.rowCount < 2) {
      return NextResponse.json(
        { success: false, message: "Excel 文件中没有数据（至少需要表头 + 1 行数据）" },
        { status: 400 }
      );
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.value || "").trim());
    });

    if (headers.length === 0) {
      return NextResponse.json(
        { success: false, message: "无法读取表头行，请检查文件格式" },
        { status: 400 }
      );
    }

    const rawRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: string[] = [];
      for (let i = 0; i < headers.length; i++) {
        const cell = row.getCell(i + 1);
        values.push(cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "");
      }
      if (values.some((v) => v)) {
        rawRows.push(values);
      }
    });

    const autoMapping = autoDetectMapping(headers);
    const fingerprint = computeFingerprint(headers);

    return NextResponse.json({
      success: true,
      data: {
        headers,
        rows: rawRows,
        autoMapping,
        fingerprint,
        sheetName: worksheet.name,
        totalRows: rawRows.length,
      },
    });
  } catch (error) {
    console.error("导入解析失败:", error);
    return NextResponse.json(
      { success: false, message: "文件解析失败，请检查文件是否损坏", error: String(error) },
      { status: 500 }
    );
  }
}
