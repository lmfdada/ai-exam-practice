const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

const testFile = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/湖南仓.xlsx';

async function testUpload() {
  const form = new FormData();
  const buffer = fs.readFileSync(testFile);
  form.append('file', buffer, { filename: '湖南仓.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders/import',
    method: 'POST',
    headers: form.getHeaders()
  };

  const req = http.request(options, (res) => {
    console.log('Response status:', res.statusCode);
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const data = JSON.parse(rawData);
        console.log('Success!');
        const headers = data.data.headers;
        const rows = data.data.rows;
        const mapping = data.data.mapping;

        console.log('Headers:', headers);
        console.log('Row count:', rows.length);
        console.log('Auto Mapping:', mapping);

        // 也打印前3行数据
        console.log('First 3 rows:');
        rows.slice(0, 3).forEach((row, i) => {
          console.log(i + ':', row);
        });
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
