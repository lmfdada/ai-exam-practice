const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const samplesFolder = path.join(__dirname, 'samples');
const sampleFiles = [
  '门店调拨单-卡片式.xlsx',
  '多门店分Sheet出库单.xlsx',
  '欢乐牧场模板0430.xlsx',
  '湖南仓.xlsx',
  '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
  '黔寨寨贵州烙锅（鞍山店）常温.pdf'
];

function testFile(fileName) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(samplesFolder, fileName);
    console.log(`\n========== 正在测试: ${fileName} ==========`);
    const form = new FormData();
    const buffer = fs.readFileSync(filePath);
    form.append('file', buffer, { filename: fileName });

    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders/import', method: 'POST', headers: form.getHeaders() }, (res) => {
      let rawData = '';
      res.on('data', d => rawData += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(rawData);
          console.log('✅ 解析成功!');
          console.log(`Headers: [${result.data.headers.join(', ')}]`);
          console.log(`Row count: ${result.data.rowCount}`);
          console.log(`Mapping:`, result.data.mapping);
          if (Object.keys(result.data.mapping || {}).length > 0) {
            console.log('🎉 字段自动映射成功!');
          } else {
            console.log('⚠️  没有自动映射到任何字段');
          }
          resolve({ success: true, fileName, result });
        } catch(e) { 
          console.error('❌ 解析失败!');
          console.error('Error:', e);
          console.error('Raw response:', rawData);
          reject({ success: false, fileName, error: e, rawResponse: rawData });
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('❌ 请求失败!');
      console.error('Error:', e);
      reject({ success: false, fileName, error: e });
    });
    
    form.pipe(req);
  });
}

async function testAll() {
  console.log('开始测试所有 samples 文件...');
  
  // 检查服务器是否在运行
  const checkResult = await new Promise((resolve) => {
    const checkReq = http.get('http://localhost:3000/', (res) => {
      resolve(true);
    });
    checkReq.on('error', () => resolve(false));
    checkReq.setTimeout(3000, () => resolve(false));
  });
  
  if (!checkResult) {
    console.error('❌ 请先启动开发服务器! 使用 `npm run dev`');
    process.exit(1);
  }
  
  console.log('✅ 服务器连接正常!');
  
  const results = [];
  for (const fileName of sampleFiles) {
    try {
      const result = await testFile(fileName);
      results.push(result);
    } catch (error) {
      results.push(error);
    }
    // 稍微等待一下避免请求太快
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n========== 测试结果总结 ==========');
  results.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.fileName}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n总文件: ${results.length}, 成功: ${successCount}, 失败: ${results.length - successCount}`);
}

testAll().catch(console.error);
