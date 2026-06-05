import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import mammoth from "mammoth";

import { generateRuleFromFile } from "@/lib/ai";
import { createEmptyRule } from "@/lib/rules";

/** POST: AI 辅助生成规则 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const manualText = formData.get("text") as string | null;

    if (!file && !manualText) {
      return NextResponse.json({ success: false, message: "请提供文件或文本内容" }, { status: 400 });
    }

    let textContent = "";
    let fileType = "";
    let fileName = "";

    if (file) {
      fileName = file.name;
      const nameLower = file.name.toLowerCase();
      if (nameLower.endsWith(".xlsx") || nameLower.endsWith(".xls")) {
        fileType = "xlsx";
        textContent = await extractExcelText(file);
      } else if (nameLower.endsWith(".pdf")) {
        fileType = "pdf";
        const buffer = await file.arrayBuffer();
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const textResult = await parser.getText();
        textContent = textResult.text.slice(0, 8000);
        await parser.destroy();
      } else if (nameLower.endsWith(".docx")) {
        fileType = "docx";
        const buffer = await file.arrayBuffer();
        const docxResult = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
        textContent = docxResult.value.slice(0, 8000);
      } else {
        fileType = "text";
        textContent = await file.text();
      }
    } else {
      textContent = manualText || "";
      fileType = "text";
      fileName = "manual_input";
    }

    if (!textContent.trim()) {
      return NextResponse.json({ success: false, message: "文件内容为空，无法分析" }, { status: 400 });
    }

    const result = await generateRuleFromFile(textContent, fileType, fileName);

    if (!result.success || !result.rule) {
      return NextResponse.json({
        success: false,
        message: result.error || "AI 生成规则失败",
        fallback: createEmptyRule(),
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result.rule,
        id: "ai_temp_" + Date.now(),
        isAiGenerated: true,
        aiDisclaimer: "此规则由 AI 自动生成，部分映射可能不准确，请手动确认后保存。",
      },
    });
  } catch (error) {
    console.error("AI 生成规则失败:", error);
    return NextResponse.json({
      success: false,
      message: "AI 生成规则失败",
      error: String(error),
      fallback: createEmptyRule(),
    }, { status: 500 });
  }
}

/** 从 Excel 文件中提取文本表示（表头 + 前几行数据） */
async function extractExcelText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const lines: string[] = [];

  for (const ws of workbook.worksheets) {
    lines.push(`=== Sheet: ${ws.name} ===`);
    const maxRows = Math.min(ws.rowCount, 20); // 最多取 20 行
    const maxCols = ws.columnCount;

    for (let r = 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= maxCols; c++) {
        const val = row.getCell(c).value;
        cells.push(val !== null && val !== undefined ? String(val) : "");
      }
      if (cells.some((v) => v.trim())) {
        lines.push(`Row ${r}: ` + cells.join(" | "));
      }
    }
  }

  return lines.join("\n");
}
