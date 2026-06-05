const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const fileToTest = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/黔寨寨贵州烙锅（鞍山店）常温.pdf';

async function testPdf() {
  console.log('Testing PDF:', fileToTest);
  
  const form = new FormData();
  const buffer = fs.readFileSync(fileToTest);
  form.append('file', buffer, { filename: 'test.pdf', contentType: 'application/pdf' });

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
      } catch(e) { 
        console.error('Error parsing response:', e);
        console.error('Raw response:', rawData);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error('Request error:', e);
  });
  
  form.pipe(req);
}

testPdf();
