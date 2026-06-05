const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileName = '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx';
const filePath = path.join(__dirname, 'samples', fileName);

async function check() {
  console.log('=== Checking file:', fileName);
  
  const formData = new FormData();
  formData.append('file', fs.readFileSync(filePath), { filename: fileName });
  
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: formData.getHeaders() }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    formData.pipe(req);
  });
  
  console.log('\n=== Parsed headers:', result.data.headers);
  console.log('\n=== Parsed rows (first 2):');
  
  for (let i=0; i<2; i++) {
    console.log(`\n--- Row ${i} ---`);
    result.data.headers.forEach((h, idx) => {
      console.log(`  ${h} = "${result.data.rows[i][idx]}"`);
    });
  }
  
  console.log('\n=== Mapping:', result.data.mapping);
}

check().catch(console.error);
