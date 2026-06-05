const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileName = '多门店分Sheet出库单.xlsx';
const filePath = path.join(__dirname, 'samples', fileName);

async function run() {
  const formData = new FormData();
  formData.append('file', fs.readFileSync(filePath), { filename: fileName });
  
  const parseResult = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: formData.getHeaders() }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    formData.pipe(req);
  });

  console.log('=== Headers:', parseResult.data.headers);
  console.log('=== Row count:', parseResult.data.rowCount);
  console.log('=== All rows:');
  for (let i = 0; i < parseResult.data.rows.length; i++) {
    const row = parseResult.data.rows[i];
    console.log(`  Row ${i}:`, row.join(' | '));
  }
  console.log('=== Mapping:', parseResult.data.mapping);
}

run().catch(console.error);
