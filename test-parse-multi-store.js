const ExcelJS = require('exceljs');
const path = require('path');

function cellValue(v) {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return cellValue(v.result);
  }
  if (typeof v === 'object' && v !== null && 'text' in v) {
    return cellValue(v.text);
  }
  return String(v);
}

function detectHeaderRow(rows) {
  let bestScore = -1;
  let bestIdx = 0;
  const keywords = ['序号', '编码', '名称', '规格', '数量', '门店', '地址', '电话', '手机', '姓名', 'sku'];
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    let score = 0;
    for (const cell of row) {
      const s = String(cell || '').trim().toLowerCase();
      for (const kw of keywords) {
        if (s.includes(kw)) {
          score +=10; break;
        }
      }
      if (s.length > 0 && s.length <20) {
        score +=1;
      }
    }
    if (score>bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

async function run() {
  const fname = path.join(__dirname, 'samples', '多门店分Sheet出库单.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fname);
  const sheets = workbook.worksheets;
  console.log('Number of sheets:', sheets.length);

  for (let s =0; s < sheets.length; s++) {
    const ws = sheets[s];
    console.log('\nSheet:', s, ws.name);
    const rows = [];
    ws.eachRow(r => rows.push(r.values.slice(1).map(cellValue)));
    console.log('All rows:');
    rows.slice(0, 20).forEach((r, idx) => {
      console.log(`  ${idx}`, JSON.stringify(r.map(v => v.trim())));
    });

    const headerRowIdx = detectHeaderRow(rows);
    console.log('headerRowIdx', headerRowIdx);

    const dataRows = rows.slice(headerRowIdx+1).filter(r => {
      const hasData = r.some(c => String(c || "").trim() !== "");
      if (!hasData) return false;
      const rowStr = r.map(c => String(c || "").trim()).join('');
      console.log('  testing data row', JSON.stringify(r), 'rowStr:', JSON.stringify(rowStr));
      if (rowStr.includes('合计') || rowStr.includes('收货人') || 
        rowStr.includes('联系电话') || rowStr.includes('制单人') || 
        rowStr.includes('审核人') || rowStr.includes('签字') || 
        rowStr.includes('出库日期') || rowStr.includes('仓库：') || 
        rowStr.includes('配送方式') || rowStr.includes('打印时间') ||
        rowStr.includes('收货门店：') || rowStr.includes('收货地址：') ||
        rowStr.includes('联系人：')) {
        console.log('    ❌ FILTERED');
        return false;
      }
      console.log('    ✅ KEEP');
      return true;
    });

    console.log('final dataRows:', JSON.stringify(dataRows, null,2));
  }
}

run().catch(console.error);
