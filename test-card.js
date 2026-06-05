
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

const testFile = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/门店调拨单-卡片式.xlsx';

async function testUpload() {
  const form = new FormData();
  const fileBuffer = fs.readFileSync(testFile);
  form.append('file', fileBuffer, { filename: '门店调拨单-卡片式.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders/import',
    method: 'POST',
    headers: form.getHeaders()
  };

  const req = http.request(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', async () => {
      try {
        const result = JSON.parse(rawData);
        console.log('Success! Result:', JSON.stringify(result, null, 2));

        // 简单验证
        const headers = result.data.headers;
        const rows = result.data.rows;
        const mapping = result.data.mapping;
        
        console.log('\nHeaders:', headers);
        console.log('\nData rows:', rows);
        console.log('\nMapping:', mapping);

      } catch (e) {
        console.error('JSON parse error:', e);
        console.log('Raw response:', rawData);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e);
  });

  form.pipe(req);
}

testUpload();
