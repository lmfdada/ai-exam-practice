import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import ExcelJS from "exceljs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download");
    const fingerprint = searchParams.get("fingerprint");

    // 下载标准模板
    if (download === "true") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("导入模板");

      // 标准字段定义
      const columns = [
        { header: "外部编码", key: "external_code", width: 18 },
        { header: "收货门店", key: "receiver_store", width: 20 },
        { header: "收件人姓名", key: "receiver_name", width: 14 },
        { header: "收件人电话", key: "receiver_phone", width: 16 },
        { header: "收件人地址", key: "receiver_address", width: 30 },
        { header: "SKU物品编码", key: "sku_code", width: 18 },
        { header: "SKU物品名称", key: "sku_name", width: 20 },
        { header: "SKU发货数量", key: "sku_qty", width: 14 },
        { header: "SKU规格型号", key: "sku_spec", width: 16 },
        { header: "备注", key: "remark", width: 20 },
      ];

      sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

      // 表头样式
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.font = { bold: true, size: 12, color: { argb: "FF303133" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFAFAFA" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.border = {
        top: { style: "thin", color: { argb: "FFDCDFE6" } },
        bottom: { style: "thin", color: { argb: "FFDCDFE6" } },
        left: { style: "thin", color: { argb: "FFDCDFE6" } },
        right: { style: "thin", color: { argb: "FFDCDFE6" } },
      };

      // 添加一行示例数据
      const exampleRow = sheet.addRow([
        "ORD001", "北京朝阳店", "张三", "13800138000",
        "北京市朝阳区建国路88号", "SKU001", "商品A", 10, "红色/L", "",
      ]);
      exampleRow.font = { size: 11, color: { argb: "FF909399" } };
      exampleRow.alignment = { vertical: "middle" };

      // 添加一行空数据（带颜色提示用户可编辑）
      const emptyRow = sheet.addRow(["", "", "", "", "", "", "", "", "", ""]);
      emptyRow.font = { size: 11, color: { argb: "FFC0C4CC" } };
      emptyRow.alignment = { vertical: "middle" };

      // 说明 sheet
      const infoSheet = workbook.addWorksheet("填写说明");
      infoSheet.columns = [
        { header: "字段", key: "field", width: 20 },
        { header: "说明", key: "desc", width: 40 },
        { header: "必填", key: "required", width: 10 },
      ];
      infoSheet.addRows([
        ["外部编码", "订单/运单的外部编号", "否"],
        ["收货门店", "接收货物的门店名称 (A组配送用)", "否"],
        ["收件人姓名", "收件人姓名 (B组配送用)", "否"],
        ["收件人电话", "收件人联系电话", "否"],
        ["收件人地址", "收件人详细地址", "否"],
        ["SKU物品编码", "物品的唯一编码", "是"],
        ["SKU物品名称", "物品的名称", "是"],
        ["SKU发货数量", "物品的发货数量", "是"],
        ["SKU规格型号", "物品的规格型号信息", "否"],
        ["备注", "附加备注信息", "否"],
      ]);

      const buf = await workbook.xlsx.writeBuffer();

      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="导入模板.xlsx"`,
        },
      });
    }

    const sql = getDb();

    if (fingerprint) {
      const rows = await sql`
        SELECT * FROM template_mappings WHERE fingerprint = ${fingerprint} LIMIT 1
      `;
      if (rows.length > 0) {
        return NextResponse.json({ success: true, data: rows[0] });
      }
      return NextResponse.json({ success: true, data: null });
    }

    const rows = await sql`
      SELECT * FROM template_mappings ORDER BY used_count DESC, created_at DESC
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("查询模板失败:", error);
    return NextResponse.json({ success: false, message: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fingerprint, mapping } = body;

    if (!fingerprint || !mapping) {
      return NextResponse.json({ success: false, message: "参数不完整" }, { status: 400 });
    }

    const sql = getDb();
    const existing = await sql`
      SELECT id FROM template_mappings WHERE fingerprint = ${fingerprint} LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE template_mappings
        SET mapping = ${JSON.stringify(mapping)}::jsonb, used_count = used_count + 1
        WHERE fingerprint = ${fingerprint}
      `;
    } else {
      await sql`
        INSERT INTO template_mappings (fingerprint, mapping)
        VALUES (${fingerprint}, ${JSON.stringify(mapping)}::jsonb)
      `;
    }

    return NextResponse.json({ success: true, message: "模板映射已保存" });
  } catch (error) {
    console.error("保存模板失败:", error);
    return NextResponse.json({ success: false, message: "保存失败" }, { status: 500 });
  }
}
