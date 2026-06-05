const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileToTest = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx';

async function peekAndTest() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileToTest);
  console.log('Sheets:', workbook.worksheets.map(ws => ws.name));

  for (const sheet of workbook.worksheets) {
    console.log(`\n=== Sheet: ${sheet.name} ===`);
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, i) => {
      if (i <= 30) {
        const cellVals = row.values;
        console.log(`Row ${i}:`, cellVals.slice(1).map(c => String(c || '').substring(0, 80)));
      }
    });
  }

  console.log('\n==== Now testing parse...');
  const form = new FormData();
  const buffer = fs.readFileSync(fileToTest);
  form.append('file', buffer, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: form.getHeaders() }, (res) => {
    let rawData = '';
    res.on('data', d => rawData += d);
    res.on('end', () => {
      try {
        console.log('\n=== Parse Result ===');
        console.log(rawData);
        const result = JSON.parse(rawData);
        console.log('Headers:', result.data?.headers);
        console.log('Row count:', result.data?.rowCount);
        console.log('Mapping:', result.data?.mapping);
        console.log('\n--- Data rows (first 3):');
        console.log(result.data?.rows?.slice(0, 3));
      } catch(e) { console.error(e); }
    });
  });
  form.pipe(req);
}

peekAndTest();
