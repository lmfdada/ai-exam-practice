const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileName = '多门店分Sheet出库单.xlsx';
const filePath = path.join(__dirname, 'samples', fileName);

async function test() {
  console.log('=== Testing multi store file');
  
  const formData = new FormData();
  formData.append('file', fs.readFileSync(filePath), { filename: fileName });
  
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: formData.getHeaders() }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    formData.pipe(req);
  });
  
  console.log('Headers:', result.data.headers);
  console.log('Row count:', result.data.rowCount);
  
  console.log('First 9 rows:');
  
  for (let i=0; i<9; i++) {
    console.log(`Row ${i} (收货门店 = "${result.data.rows[i][0]} , 物品名称 = "${result.data.rows[i][3]})`);
  }
  
  console.log('Mapping:', JSON.stringify(result.data.mapping, null, 2));
}

test().catch(console.error);
