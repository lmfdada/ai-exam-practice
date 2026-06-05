
// 直接复制一下我们的代码
const FIELD_KEYWORDS = {
  external_code: ["外部编码", "外部单号", "订单编号", "订单号", "外部订单号", "客户单号", "配送单号", "出库单号", "excode", "external_code"],
  receiver_store: ["收货门店", "门店名称", "门店", "收货仓库", "store", "门店名", "收货门店名称", "门店信息", "机构名称", "收货机构"],
  receiver_name: ["收件人姓名", "收件人", "收货人", "收货人姓名", "接收人", "签收人", "receiver_name", "consignee"],
  receiver_phone: ["收件人电话", "收件人手机", "收件人联系方式", "收货人电话", "收货人手机", "收货电话", "收件电话", "receiver_phone", "receiver tel"],
  receiver_address: ["收件人地址", "收货人地址", "收货地址", "收件地址", "接收人地址", "配送地址", "receiver_address"],
  sku_code: ["物品编码", "SKU编码", "商品编码", "产品编码", "物料编码", "编码", "sku_code", "sku", "物料号", "货号", "商品编号"],
  sku_name: ["物品名称", "SKU名称", "商品名称", "产品名称", "物料名称", "名称", "品名", "物品名", "sku_name", "商品名", "货品名称"],
  sku_qty: ["发货数量", "出库数量", "配送数量", "发货量", "应发数量", "数量", "sku数量", "sku_qty", "qty", "数量(件)", "数量（件）"],
  sku_spec: ["规格型号", "规格", "型号", "sku规格", "物品规格", "spec", "sku_spec", "规格描述"],
  remark: ["备注", "备注信息", "说明", "备注说明", "remark", "notes", "备注/说明", "附言", "note"],
};

function autoDetectMapping(headers) {
  const mapping = {};
  const usedFields = new Set();
  const usedHeaders = new Set();

  const allMatches = [];

  // 第一步：收集所有可能的匹配
  for (const header of headers) {
    const trimmed = header.trim().toLowerCase();
    const headerClean = trimmed.replace(/[\s\-_（）()\s]/g, "");

    for (const [fieldKey, keywords] of Object.entries(FIELD_KEYWORDS)) {
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        let score = 0;

        if (trimmed.includes(kwLower)) {
          score = kwLower.length;
        }

        const kwClean = kwLower.replace(/[\s\-_（）()\s]/g, "");
        if (kwClean === headerClean) {
          score = kwClean.length + 100;
        }

        if (score > 0) {
          // 关键加分：列名本身包含"发货"的，直接加 200 分，优先级最高！
          if (trimmed.includes("发货")) {
            score += 200;
          }
          allMatches.push({ header, fieldKey, score });
          break;
        }
      }
    }
  }

  console.log('ALL MATCHES BEFORE SORT:', allMatches);

  // 第二步：按分数从高到低排序！
  allMatches.sort((a, b) => b.score - a.score);

  console.log('ALL MATCHES AFTER SORT:', allMatches);

  // 第三步：逐个分配最佳匹配，不重复使用 header 或 field
  for (const match of allMatches) {
    if (!usedHeaders.has(match.header) && !usedFields.has(match.fieldKey)) {
      mapping[match.header] = match.fieldKey;
      usedHeaders.add(match.header);
      usedFields.add(match.fieldKey);
      console.log('ASSIGNED:', match.header, '->', match.fieldKey);
    }
  }

  return mapping;
}

// 测试我们的 headers
const headers = [
  '收货机构',
  '配送汇总单号*',
  '配送单号',
  '物品行号*',
  '物品分类',
  '物品编码*',
  '物品名称',
  '物品品牌',
  '规格型号',
  '订货单位',
  '订货单位和基准单位换算率',
  '应发数量',
  '发货数量*',
  '发货仓库*',
  '批次号*',
  '生产日期*',
  '辅助单位',
  '辅助单位换算关系',
  '辅助单位应发数量',
  '辅助单位发货数量*',
  '单据备注',
  '物品备注',
  '发货日期',
  '预计发货日期',
  '预计到货日期',
  '期望到货日期',
  '收货人',
  '收货电话',
  '收货地址',
  '备用联系人',
  '备用联系电话',
  '收货机构备注'
];

const result = autoDetectMapping(headers);
console.log('\nFINAL RESULT:', result);
