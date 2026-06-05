// ===== SKU 模式下的标准字段定义（考试要求） =====
export const STANDARD_FIELDS = [
  { key: "external_code", label: "外部编码", required: false, group: "order" },
  { key: "receiver_store", label: "收货门店", required: false, group: "group_a" },
  { key: "receiver_name", label: "收件人姓名", required: false, group: "group_b" },
  { key: "receiver_phone", label: "收件人电话", required: false, group: "group_b" },
  { key: "receiver_address", label: "收件人地址", required: false, group: "group_b" },
  { key: "sku_code", label: "SKU物品编码", required: true, group: "sku" },
  { key: "sku_name", label: "SKU物品名称", required: true, group: "sku" },
  { key: "sku_qty", label: "SKU发货数量", required: true, group: "sku" },
  { key: "sku_spec", label: "SKU规格型号", required: false, group: "sku" },
  { key: "remark", label: "备注", required: false, group: "other" },
] as const;

export type StandardFieldKey = (typeof STANDARD_FIELDS)[number]["key"];

export type OrderRow = {
  external_code: string;
  receiver_store: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  sku_code: string;
  sku_name: string;
  sku_qty: number;
  sku_spec: string;
  remark: string;
};

/** 从原始映射数据构建标准 OrderRow */
export function buildOrderRow(mapped: Record<string, string>): OrderRow {
  return {
    external_code: mapped.external_code || "",
    receiver_store: mapped.receiver_store || "",
    receiver_name: mapped.receiver_name || "",
    receiver_phone: mapped.receiver_phone || "",
    receiver_address: mapped.receiver_address || "",
    sku_code: mapped.sku_code || "",
    sku_name: mapped.sku_name || "",
    sku_qty: mapped.sku_qty ? Number(mapped.sku_qty) : 0,
    sku_spec: mapped.sku_spec || "",
    remark: mapped.remark || "",
  };
}

export const FIELD_KEYWORDS: Record<string, string[]> = {
  external_code: ["外部编码", "外部单号", "订单编号", "订单号", "外部订单号", "客户单号", "配送单号", "出库单号", "excode", "external_code"],
  receiver_store: ["收货门店", "门店名称", "门店", "收货仓库", "store", "门店名", "收货门店名称", "门店信息", "机构名称"],
  receiver_name: ["收件人姓名", "收件人", "收货人", "收货人姓名", "接收人", "签收人", "receiver_name", "consignee"],
  receiver_phone: ["收件人电话", "收件人手机", "收件人联系方式", "收货人电话", "收货人手机", "收货电话", "收件电话", "receiver_phone", "receiver tel"],
  receiver_address: ["收件人地址", "收货人地址", "收货地址", "收件地址", "接收人地址", "配送地址", "receiver_address"],
  sku_code: ["物品编码", "SKU编码", "SKU编码", "商品编码", "产品编码", "物料编码", "编码", "sku_code", "sku", "物料号", "货号", "商品编号"],
  sku_name: ["物品名称", "SKU名称", "SKU名称", "商品名称", "产品名称", "物料名称", "名称", "品名", "物品名", "sku_name", "商品名", "货品名称"],
  sku_qty: ["发货数量", "数量", "出库数量", "配送数量", "sku数量", "发货量", "sku_qty", "qty", "数量(件)", "数量（件）"],
  sku_spec: ["规格型号", "规格", "型号", "sku规格", "物品规格", "spec", "sku_spec", "规格描述"],
  remark: ["备注", "备注信息", "说明", "备注说明", "remark", "notes", "备注/说明", "附言", "note"],
};

export function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const trimmed = header.trim().toLowerCase();
    const headerClean = trimmed.replace(/[\s\-_（）()\s]/g, "");

    interface Candidate {
      fieldKey: string;
      matchLen: number;
    }
    const candidates: Candidate[] = [];

    for (const [fieldKey, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (usedFields.has(fieldKey)) continue;
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (trimmed.includes(kwLower)) {
          candidates.push({ fieldKey, matchLen: kwLower.length });
          break;
        }
        const kwClean = kwLower.replace(/[\s\-_（）()\s]/g, "");
        if (kwClean === headerClean) {
          candidates.push({ fieldKey, matchLen: kwClean.length + 100 });
          break;
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.matchLen - a.matchLen);
      const best = candidates[0];
      mapping[header] = best.fieldKey;
      usedFields.add(best.fieldKey);
    }
  }

  return mapping;
}

export function computeFingerprint(headers: string[]): string {
  const sorted = [...headers].map((h) => h.trim().toLowerCase()).sort();
  return sorted.join("||");
}

export function validatePhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone.trim());
}

/** A组/B组校验：至少填一组 */
function validateGroupAB(row: Record<string, string>, index: number, errors: string[]) {
  const hasGroupA = !!row.receiver_store?.trim();
  const hasGroupB = !!(row.receiver_name?.trim() || row.receiver_phone?.trim() || row.receiver_address?.trim());

  if (!hasGroupA && !hasGroupB) {
    errors.push(`第 ${index + 1} 行：收货信息缺失，请填写"收货门店"(A组) 或 "收件人姓名+电话+地址"(B组)`);
    return;
  }

  if (hasGroupB) {
    if (!row.receiver_name?.trim()) errors.push(`第 ${index + 1} 行，收件人姓名：B组模式下不能为空`);
    if (!row.receiver_phone?.trim()) errors.push(`第 ${index + 1} 行，收件人电话：B组模式下不能为空`);
    else if (!validatePhone(row.receiver_phone)) errors.push(`第 ${index + 1} 行，收件人电话：格式错误（需为 11 位手机号）`);
    if (!row.receiver_address?.trim()) errors.push(`第 ${index + 1} 行，收件人地址：B组模式下不能为空`);
  }
}

export function validateRow(row: Record<string, string>, index: number, allRows: Record<string, string>[], existingCodes: Set<string>): string[] {
  const errors: string[] = [];

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

  // A组/B组校验
  validateGroupAB(row, index, errors);

  // 外部编码重复检测
  const code = row.external_code?.trim();
  if (code) {
    const duplicateInBatch = allRows.findIndex(
      (r, i) => i !== index && r.external_code?.trim() === code
    );
    if (duplicateInBatch !== -1) {
      errors.push(`第 ${index + 1} 行，外部编码：与第 ${duplicateInBatch + 1} 行重复`);
    }
    if (existingCodes.has(code)) {
      errors.push(`第 ${index + 1} 行，外部编码：数据库中已存在该编码`);
    }
  }

  return errors;
}
