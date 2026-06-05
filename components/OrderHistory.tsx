"use client";

import { useState, useCallback, startTransition, useEffect } from "react";

interface OrderRecord {
  id: number;
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
  batch_id: string;
  created_at: string;
}

export default function OrderHistory({ refreshKey }: { refreshKey?: number }) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [externalCode, setExternalCode] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverStore, setReceiverStore] = useState("");
  const [skuName, setSkuName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const totalPages = Math.ceil(total / pageSize);

  const doFetch = useCallback(async (
    targetPage: number,
    ec: string,
    rn: string,
    rs: string,
    sn: string,
    sd: string,
    ed: string
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(pageSize));
      if (ec) params.set("externalCode", ec);
      if (rn) params.set("receiverName", rn);
      if (rs) params.set("receiverStore", rs);
      if (sn) params.set("skuName", sn);
      if (sd) params.set("startDate", sd);
      if (ed) params.set("endDate", ed);

      const res = await fetch(`/api/orders?${params}`);
      const json = await res.json();

      if (json.success) {
        setOrders(json.data || []);
        setTotal(json.pagination?.total || 0);
        setPage(json.pagination?.page || 1);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const fetchOrders = useCallback(
    (targetPage: number) => doFetch(targetPage, externalCode, receiverName, receiverStore, skuName, startDate, endDate),
    [doFetch, externalCode, receiverName, receiverStore, skuName, startDate, endDate]
  );

  const handleSearch = useCallback(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  }, [handleSearch]);

  const clearFilters = useCallback(() => {
    setExternalCode("");
    setReceiverName("");
    setReceiverStore("");
    setSkuName("");
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      doFetch(1, "", "", "", "", "", "");
    });
  }, [doFetch]);

  useEffect(() => {
    startTransition(() => {
      doFetch(1, externalCode, receiverName, receiverStore, skuName, startDate, endDate);
    });
    // 仅在挂载时获取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshKey === undefined) return;
    startTransition(() => {
      doFetch(1, externalCode, receiverName, receiverStore, skuName, startDate, endDate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasFilters = externalCode || receiverName || receiverStore || skuName || startDate || endDate;

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* 搜索栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mb-3 shrink-0">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">外部编码</label>
          <input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入外部编码..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            style={{ borderColor: "var(--border-color)", background: "var(--bg-card)" }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">收货门店</label>
          <input
            value={receiverStore}
            onChange={(e) => setReceiverStore(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入门店名称..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            style={{ borderColor: "var(--border-color)", background: "var(--bg-card)" }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">收件人姓名</label>
          <input
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入收件人姓名..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            style={{ borderColor: "var(--border-color)", background: "var(--bg-card)" }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">SKU物品名称</label>
          <input
            value={skuName}
            onChange={(e) => setSkuName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入SKU名称..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
            style={{ borderColor: "var(--border-color)", background: "var(--bg-card)" }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none transition-colors"
            style={{ borderColor: "var(--border-color)", background: "var(--bg-card)", colorScheme: "dark" }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">结束日期</label>
          <div className="flex gap-1">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none transition-colors"
              style={{ borderColor: "var(--border-color)", background: "var(--bg-card)", colorScheme: "dark" }}
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0"
              style={{ background: "var(--primary-bg)", color: "var(--primary)" }}
            >
              搜索
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-2 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors shrink-0"
                style={{ background: "var(--bg-card)" }}
                title="清除筛选"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="border rounded-xl overflow-hidden flex-1 min-h-0"
           style={{ borderColor: "var(--border-color)" }}>
        <div className="h-full overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "var(--bg-card)" }}>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">#</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">外部编码</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收货门店</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件人姓名</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件人电话</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件人地址</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">SKU物品编码</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">SKU物品名称</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">SKU数量</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">SKU规格型号</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">备注</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">批次号</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">提交时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin"
                           style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                      <span>加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    {hasFilters ? "未找到匹配的记录" : "暂无历史数据"}
                  </td>
                </tr>
              ) : (
                orders.map((order, i) => (
                  <tr key={order.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-2 text-gray-500">{(page - 1) * pageSize + i + 1}</td>
                    <td className="p-2 text-gray-200 font-mono truncate max-w-[120px]" title={order.external_code}>
                      {order.external_code || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">
                      {order.receiver_store || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">
                      {order.receiver_name || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap font-mono text-[11px]">
                      {order.receiver_phone || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 truncate max-w-[180px]" title={order.receiver_address}>
                      {order.receiver_address || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 font-mono text-[11px]">
                      {order.sku_code || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">
                      {order.sku_name || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200">
                      {order.sku_qty ?? <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200">
                      {order.sku_spec || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-400 truncate max-w-[120px]" title={order.remark}>
                      {order.remark || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-500 font-mono text-[10px] truncate max-w-[100px]" title={order.batch_id}>
                      {order.batch_id}
                    </td>
                    <td className="p-2 text-gray-500 whitespace-nowrap text-[11px]">
                      {new Date(order.created_at).toLocaleString("zh-CN", {
                        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-400 shrink-0">
          <span>共 {total} 条 · 本页 {orders.length} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchOrders(1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded disabled:opacity-30 hover:text-white transition-colors"
              title="首页"
            >
              ◀◀
            </button>
            <button
              onClick={() => fetchOrders(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded disabled:opacity-30 hover:text-white transition-colors"
              title="上一页"
            >
              ◀
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-gray-600 select-none">...</span>}
                  <button
                    onClick={() => fetchOrders(p)}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      p === page
                        ? "font-medium"
                        : "hover:text-white"
                    }`}
                    style={p === page ? { background: "var(--primary-bg)", color: "var(--primary)" } : undefined}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => fetchOrders(page + 1)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded disabled:opacity-30 hover:text-white transition-colors"
              title="下一页"
            >
              ▶
            </button>
            <button
              onClick={() => fetchOrders(totalPages)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded disabled:opacity-30 hover:text-white transition-colors"
              title="末页"
            >
              ▶▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
