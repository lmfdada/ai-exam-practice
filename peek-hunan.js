const ExcelJS = require('exceljs');
const fs = require('fs');

const filePath = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/湖南仓.xlsx';

async function peek() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('Sheets:', workbook.worksheets.map(w => w.name));

  for (const sheet of workbook.worksheets) {
    console.log(`\n=== Sheet: ${sheet.name} ===`);
    console.log('Row count:', sheet.rowCount, 'Column count:', sheet.columnCount);

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, i) => {
      if (i <= 10) {
        const values = row.values;
        // values[0] 是 undefined，所以从 1 开始
        console.log(`Row ${i}:`, values.slice(1).map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.text) return v.text;
          return String(v).substring(0, 50);
        }));
      }
    });
  }
}

peek().catch(console.error);
