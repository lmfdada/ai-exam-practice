const ExcelJS = require('exceljs');
const fs = require('fs');

const filePath = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/门店调拨单-卡片式.xlsx';

async function peek() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('Sheets:', workbook.worksheets.map(w => w.name));

  for (const sheet of workbook.worksheets) {
    console.log(`\n=== Sheet: ${sheet.name} ===`);
    console.log('Row count:', sheet.rowCount, 'Column count:', sheet.columnCount);

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, i) => {
      if (i <= 50) {
        const values = row.values;
        // values[0] is undefined, so from 1
        console.log(`Row ${i}:`, values.slice(1).map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.text) return v.text;
          return String(v).substring(0, 100);
        }));
      }
    });
  }
}

peek().catch(console.error);
