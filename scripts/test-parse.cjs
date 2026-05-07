const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const STANDARD_FIELDS = [
  { key: "external_code", label: "外部编码", required: false },
  { key: "sender_name", label: "发件人姓名", required: true },
  { key: "sender_phone", label: "发件人电话", required: true },
  { key: "sender_address", label: "发件人地址", required: true },
  { key: "receiver_name", label: "收件人姓名", required: true },
  { key: "receiver_phone", label: "收件人电话", required: true },
  { key: "receiver_address", label: "收件人地址", required: true },
  { key: "weight", label: "重量 (kg)", required: true },
  { key: "piece_count", label: "件数", required: true },
  { key: "temperature_level", label: "温层", required: true },
  { key: "remark", label: "备注", required: false },
];

const FIELD_KEYWORDS = {
  external_code: ["外部编码", "外部单号", "订单编号", "订单号", "外部订单号", "客户单号", "excode", "external_code", "external code", "外编码", "ref code"],
  sender_name: ["发件人姓名", "发件人", "寄件人姓名", "寄件人", "发货人", "发货人姓名", "sender_name", "sender name", "sender"],
  sender_phone: ["发件人电话", "发件人手机", "发件人联系方式", "寄件人电话", "寄件人手机", "发货人电话", "发货电话", "发件电话", "sender_phone", "sender phone", "sender tel"],
  sender_address: ["发件人地址", "寄件人地址", "发货人地址", "发货地址", "发件地址", "sender_address", "sender address"],
  receiver_name: ["收件人姓名", "收件人", "收货人", "收货人姓名", "接收人", "receiver_name", "receiver name", "receiver", "consignee"],
  receiver_phone: ["收件人电话", "收件人手机", "收件人联系方式", "收货人电话", "收货人手机", "收货电话", "收件电话", "receiver_phone", "receiver phone", "receiver tel"],
  receiver_address: ["收件人地址", "收货人地址", "收货地址", "收件地址", "接收人地址", "receiver_address", "receiver address"],
  weight: ["重量", "重量kg", "重量(kg)", "重量（kg）", "weight", "kg", "毛重", "货物重量"],
  piece_count: ["件数", "数量", "包裹数量", "总件数", "piece_count", "piece count", "pcs", "箱数", "qty"],
  temperature_level: ["温层", "温度层", "温层要求", "温度要求", "温度", "temperature_level", "temperature", "temp zone", "temp"],
  remark: ["备注", "备注信息", "说明", "备注说明", "remark", "notes", "备注/说明", "附言", "note"],
};

const DESCRIPTION_MARKERS = ["说明", "注意", "备注：", "提示"];

function isDescriptionRow(row) {
  let nonEmptyCount = 0;
  let markerCount = 0;
  row.eachCell({ includeEmpty: false }, (cell) => {
    const val = String(cell.value || "").trim().toLowerCase();
    if (val) {
      nonEmptyCount++;
      if (DESCRIPTION_MARKERS.some((m) => val.includes(m))) {
        markerCount++;
      }
    }
  });
  if (nonEmptyCount === 0) return false;
  return markerCount / nonEmptyCount > 0.3;
}

function getRowCells(row, maxCols) {
  const values = [];
  for (let col = 1; col <= maxCols; col++) {
    const cell = row.getCell(col);
    const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "";
    values.push(val);
  }
  return values;
}

function isRowEmpty(cells) {
  return cells.every((v) => !v);
}

function calcHeaderScore(cells) {
  const nonEmpty = cells.filter((v) => v.length > 0);
  if (nonEmpty.length < 3) return -1;

  const uniqueValues = new Set(nonEmpty);
  const uniquenessRatio = uniqueValues.size / nonEmpty.length;
  if (uniquenessRatio < 0.5) return -1;

  let keywordHits = 0;
  const allKeywords = Object.values(FIELD_KEYWORDS).flat();
  for (const cell of nonEmpty) {
    const cellLower = cell.toLowerCase();
    for (const kw of allKeywords) {
      if (cellLower.includes(kw.toLowerCase())) {
        keywordHits++;
        break;
      }
    }
  }

  const keywordScore = keywordHits / nonEmpty.length;
  return uniquenessRatio * 0.4 + keywordScore * 0.6;
}

function detectHeaderRow(worksheet) {
  const maxCols = worksheet.columnCount;
  let bestRow = 1;
  let bestHeaders = [];
  let bestScore = -1;

  const maxScan = Math.min(8, worksheet.rowCount);

  for (let rowNum = 1; rowNum <= maxScan; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const cells = getRowCells(row, maxCols);

    console.log(`  Row ${rowNum}: empty=${isRowEmpty(cells)}, desc=${isDescriptionRow(row)}, score=${calcHeaderScore(cells).toFixed(2)}`);

    if (isRowEmpty(cells)) continue;
    if (isDescriptionRow(row)) continue;

    const score = calcHeaderScore(cells);
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowNum;
      bestHeaders = cells.filter((v) => v.length > 0);
    }
  }

  return { rowNumber: bestRow, headers: bestHeaders, score: bestScore };
}

function autoDetectMapping(headers) {
  const mapping = {};
  const usedFields = new Set();

  for (const header of headers) {
    const trimmed = header.trim().toLowerCase();
    const headerClean = trimmed.replace(/[\s\-_（）()]/g, "");

    const candidates = [];

    for (const [fieldKey, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (usedFields.has(fieldKey)) continue;
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (trimmed.includes(kwLower)) {
          candidates.push({ fieldKey, matchLen: kwLower.length });
          break;
        }
        const kwClean = kwLower.replace(/[\s\-_（）()]/g, "");
        if (kwClean === headerClean) {
          candidates.push({ fieldKey, matchLen: kwClean.length + 100 });
          break;
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.matchLen - a.matchLen);
      const best = candidates[0];
      mapping[header] = best.fieldKey;
      usedFields.add(best.fieldKey);
    }
  }

  return mapping;
}

const INSTRUCTION_SHEET_NAMES = ["说明", "使用说明", "填写说明", "help", "readme", "instructions"];

async function testFile(filePath) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📄 测试文件: ${path.basename(filePath)}`);
  console.log("=".repeat(70));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log(`共 ${workbook.worksheets.length} 个 Sheet:`);
  for (const ws of workbook.worksheets) {
    console.log(`  - "${ws.name}" (${ws.rowCount}行 x ${ws.columnCount}列)`);
  }

  // --- 多 Sheet 智能选择 ---
  const candidates = [];
  for (const ws of workbook.worksheets) {
    const nameLower = ws.name.toLowerCase();
    const isInstructionSheet = INSTRUCTION_SHEET_NAMES.some((n) => nameLower.includes(n));
    if (isInstructionSheet) {
      console.log(`\n⏭️  跳过说明Sheet: "${ws.name}"`);
      continue;
    }
    if (ws.rowCount < 2) continue;

    const result = detectHeaderRow(ws);
    if (result.headers.length > 0) {
      candidates.push({
        worksheet: ws,
        headerRow: result.rowNumber,
        headers: result.headers,
        score: result.score,
      });
    }
  }

  if (candidates.length === 0) {
    console.log("\n❌ 未找到有效的数据Sheet");
    return { file: path.basename(filePath), allFieldsMapped: false, dataCount: 0 };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const worksheet = best.worksheet;
  const { headerRow: rowNumber, headers, score } = best;

  console.log(`\n--- 选择 Sheet: "${worksheet.name}" ---`);
  console.log("--- 表头检测评分 ---");
  for (let rowNum = 1; rowNum <= Math.min(8, worksheet.rowCount); rowNum++) {
    const row = worksheet.getRow(rowNum);
    const cells = getRowCells(row, worksheet.columnCount);
    console.log(`  Row ${rowNum}: empty=${isRowEmpty(cells)}, desc=${isDescriptionRow(row)}, score=${calcHeaderScore(cells).toFixed(2)}`);
  }

  console.log(`\n✅ 检测结果: 表头在第 ${rowNumber} 行 (score=${score.toFixed(2)})`);
  console.log(`   识别到 ${headers.length} 个列头:`);
  headers.forEach((h, i) => console.log(`   [${i + 1}] ${h}`));

  console.log("\n--- 自动映射 ---");
  const mapping = autoDetectMapping(headers);
  let mappedCount = 0;
  for (const [col, field] of Object.entries(mapping)) {
    const fieldDef = STANDARD_FIELDS.find((f) => f.key === field);
    console.log(`   ${col} → ${fieldDef ? fieldDef.label : field}`);
    mappedCount++;
  }
  console.log(`   匹配率: ${mappedCount}/${headers.length} (${Math.round(mappedCount / headers.length * 100)}%)`);

  const requiredFields = STANDARD_FIELDS.filter((f) => f.required).map((f) => f.key);
  const mappedFields = Object.values(mapping);
  const missingRequired = requiredFields.filter((f) => !mappedFields.includes(f));
  if (missingRequired.length > 0) {
    console.log(`\n❌ 缺少必填字段: ${missingRequired.map((k) => STANDARD_FIELDS.find((f) => f.key === k)?.label || k).join(", ")}`);
  } else {
    console.log(`\n✅ 所有必填字段均已匹配！`);
  }

  console.log("\n--- 数据行读取 ---");
  const dataRows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= rowNumber) return;
    const values = [];
    for (let i = 0; i < headers.length; i++) {
      const cell = row.getCell(i + 1);
      values.push(cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : "");
    }
    if (values.some((v) => v)) {
      dataRows.push(values);
    }
  });

  console.log(`   读取到 ${dataRows.length} 行数据`);
  dataRows.forEach((r, i) => {
    console.log(`   [${i + 1}] ${r.join(" | ")}`);
  });

  const allFieldsMapped = missingRequired.length === 0;
  return {
    file: path.basename(filePath),
    headerRow: rowNumber,
    headers,
    mapping,
    allFieldsMapped,
    dataCount: dataRows.length,
  };
}

async function main() {
  const samplesDir = path.join(__dirname, "..", "samples");
  const files = fs.readdirSync(samplesDir).filter((f) => f.endsWith(".xlsx"));

  let allPassed = true;

  for (const file of files) {
    const result = await testFile(path.join(samplesDir, file));
    if (!result.allFieldsMapped) {
      allPassed = false;
      console.log(`\n⚠️  ${result.file}: 必填字段映射不完整`);
    } else {
      console.log(`\n✅ ${result.file}: 全部通过`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(allPassed ? "🎉 所有模板验证通过！" : "⚠️  部分模板验证未通过，请检查上述日志");
  console.log("=".repeat(70));
}

main().catch(console.error);
