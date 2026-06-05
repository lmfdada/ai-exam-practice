const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileToTest = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/门店调拨单-卡片式.xlsx';

async function test() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileToTest);
  console.log('Sheets:', workbook.worksheets.map(ws => ws.name));

  for (const sheet of workbook.worksheets) {
    console.log(`\n=== Sheet: ${sheet.name} ===`);
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, i) => {
      if (i <= 50) {
        const cellVals = row.values;
        console.log(`Row ${i}:`, cellVals.slice(1).map(c => String(c || '').substring(0, 80)));
      }
    });
  }

  console.log('\n==== Now testing parse ===');
  const form = new FormData();
  const buffer = fs.readFileSync(fileToTest);
  form.append('file', buffer, { filename: 'test.xlsx' });

  const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: form.getHeaders() }, (res) => {
    let rawData = '';
    res.on('data', d => rawData += d);
    res.on('end', () => {
      console.log('\n=== Parse Result ===');
      console.log(rawData);
    });
  });
  form.pipe(req);
}

test().catch(console.error);
