
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

// 直接复制验证函数
function validateRow(row, index, allRows, existingCodes) {
  const errors = [];
  // 复制一下我们的验证函数
  // SKU 必填字段
  if (!row.sku_code?.trim()) {
    errors.push(`第 ${index + 1} 行，SKU物品编码：不能为空`);
  }
  if (!row.sku_name?.trim()) {
    errors.push(`第 ${index + 1} 行，SKU物品名称：不能为空`);
  }
  if (row.sku_qty === undefined || row.sku_qty === null || String(row.sku_qty).trim() === "") {
    errors.push(`第 ${index + 1} 行，SKU发货数量：不能为空`);
  } else if (Number(row.sku_qty) <= 0) {
    errors.push(`第 ${index + 1} 行，SKU发货数量：必须为正数`);
  }
  return errors;
}

const testFile = '/Users/limengfei/Desktop/test/ai-exam-practice/samples/湖南仓.xlsx';

async function testUpload() {
  const form = new FormData();
  const fileBuffer = fs.readFileSync(testFile);
  form.append('file', fileBuffer, { filename: '湖南仓.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

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

        const headers = result.data.headers;
        const rows = result.data.rows;
        const mapping = result.data.mapping;

        // 构建preview的rows
        const previewRows = rows.map(rowArr => {
          const r = {};
          headers.forEach((h, i) => {
            const targetField = mapping[h];
            if (targetField) {
              r[targetField] = rowArr[i];
            }
          });
          return r;
        });

        // 验证每一行
        let totalErrors = 0;
        console.log('\n=== VALIDATION RESULTS ===');
        previewRows.forEach((row, index) => {
          const errors = validateRow(row, index, previewRows, new Set());
          if (errors.length > 0) {
            console.log(`Row ${index + 1}: ${errors.join(', ')}`);
            totalErrors += errors.length;
          }
        });

        console.log(`\nTOTAL ERRORS: ${totalErrors}`);
        if (totalErrors === 0) {
          console.log('✅ ALL OKAY! CAN SUBMIT!');
        } else {
          console.log('❌ HAS ERRORS!');
        }
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
