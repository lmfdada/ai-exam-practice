import { neon } from "@neondatabase/serverless";

export function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export const STANDARD_FIELDS = [
  { key: "external_code", label: "外部编码", required: false },
  { key: "sender_name", label: "发件人姓名", required: true },
  { key: "sender_phone", label: "发件人电话", required: true },
  { key: "sender_address", label: "发件人地址", required: true },
  { key: "receiver_name", label: "收件人姓名", required: true },
  { key: "receiver_phone", label: "收件人电话", required: true },
  { key: "receiver_address", label: "收件人地址", required: true },
  { key: "weight", label: "重量 (kg)", required: true },
  { key: "piece_count", label: "件数", required: true },
  { key: "temperature_level", label: "温层", required: true },
  { key: "remark", label: "备注", required: false },
] as const;

export const TEMPERATURE_OPTIONS = ["常温", "冷藏", "冷冻"];

export type OrderRow = {
  external_code: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight: number;
  piece_count: number;
  temperature_level: string;
  remark: string;
};

export const FIELD_KEYWORDS: Record<string, string[]> = {
  external_code: ["外部编码", "外部单号", "订单编号", "订单号", "外部订单号", "客户单号", "excode", "external_code", "external code", "外编码", "ref code"],
  sender_name: ["发件人姓名", "发件人", "寄件人姓名", "寄件人", "发货人", "发货人姓名", "sender_name", "sender name", "sender"],
  sender_phone: ["发件人电话", "发件人手机", "发件人联系方式", "寄件人电话", "寄件人手机", "发货人电话", "发货电话", "发件电话", "sender_phone", "sender phone", "sender tel"],
  sender_address: ["发件人地址", "寄件人地址", "发货人地址", "发货地址", "发件地址", "sender_address", "sender address"],
  receiver_name: ["收件人姓名", "收件人", "收货人", "收货人姓名", "接收人", "receiver_name", "receiver name", "receiver", "consignee"],
  receiver_phone: ["收件人电话", "收件人手机", "收件人联系方式", "收货人电话", "收货人手机", "收货电话", "收件电话", "receiver_phone", "receiver phone", "receiver tel"],
  receiver_address: ["收件人地址", "收货人地址", "收货地址", "收件地址", "接收人地址", "receiver_address", "receiver address"],
  weight: ["重量", "重量kg", "重量(kg)", "重量（kg）", "weight", "kg", "毛重", "货物重量"],
  piece_count: ["件数", "数量", "包裹数量", "总件数", "piece_count", "piece count", "pcs", "箱数", "qty"],
  temperature_level: ["温层", "温度层", "温层要求", "温度要求", "温度", "temperature_level", "temperature", "temp zone", "temp"],
  remark: ["备注", "备注信息", "说明", "备注说明", "remark", "notes", "备注/说明", "附言", "note"],
};

export function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const trimmed = header.trim().toLowerCase();
    const headerClean = trimmed.replace(/[\s\-_（）()]/g, "");

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
        const kwClean = kwLower.replace(/[\s\-_（）()]/g, "");
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

export function validateRow(row: Record<string, string>, index: number, allRows: Record<string, string>[], existingCodes: Set<string>): string[] {
  const errors: string[] = [];

  if (!row.sender_name?.trim()) {
    errors.push(`第 ${index + 1} 行，发件人姓名：不能为空`);
  }
  if (!row.sender_phone?.trim()) {
    errors.push(`第 ${index + 1} 行，发件人电话：不能为空`);
  } else if (!validatePhone(row.sender_phone)) {
    errors.push(`第 ${index + 1} 行，发件人电话：格式错误（需为 11 位手机号）`);
  }
  if (!row.sender_address?.trim()) {
    errors.push(`第 ${index + 1} 行，发件人地址：不能为空`);
  }
  if (!row.receiver_name?.trim()) {
    errors.push(`第 ${index + 1} 行，收件人姓名：不能为空`);
  }
  if (!row.receiver_phone?.trim()) {
    errors.push(`第 ${index + 1} 行，收件人电话：不能为空`);
  } else if (!validatePhone(row.receiver_phone)) {
    errors.push(`第 ${index + 1} 行，收件人电话：格式错误（需为 11 位手机号）`);
  }
  if (!row.receiver_address?.trim()) {
    errors.push(`第 ${index + 1} 行，收件人地址：不能为空`);
  }
  if (row.weight === undefined || row.weight === null || String(row.weight).trim() === "") {
    errors.push(`第 ${index + 1} 行，重量：不能为空`);
  } else if (Number(row.weight) <= 0) {
    errors.push(`第 ${index + 1} 行，重量：必须为正数`);
  }
  if (row.piece_count === undefined || row.piece_count === null || String(row.piece_count).trim() === "") {
    errors.push(`第 ${index + 1} 行，件数：不能为空`);
  } else if (!Number.isInteger(Number(row.piece_count)) || Number(row.piece_count) <= 0) {
    errors.push(`第 ${index + 1} 行，件数：必须为正整数`);
  }
  if (!row.temperature_level?.trim()) {
    errors.push(`第 ${index + 1} 行，温层：不能为空`);
  } else if (!["常温", "冷藏", "冷冻"].includes(row.temperature_level.trim())) {
    errors.push(`第 ${index + 1} 行，温层：必须为"常温"、"冷藏"或"冷冻"`);
  }

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
