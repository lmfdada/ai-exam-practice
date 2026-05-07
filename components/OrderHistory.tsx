"use client";

import { useState, useCallback, startTransition } from "react";

interface OrderRecord {
  id: number;
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
  batch_id: string;
  created_at: string;
}

export default function OrderHistory() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [externalCode, setExternalCode] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const totalPages = Math.ceil(total / pageSize);

  const doFetch = useCallback(async (
    targetPage: number,
    ec: string,
    rn: string,
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
      if (sd) params.set("startDate", sd);
      if (ed) params.set("endDate", ed);

      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.data);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    startTransition(() => {
      doFetch(1, externalCode, receiverName, startDate, endDate);
      setLoaded(true);
    });
  }

  const fetchOrders = useCallback(
    (targetPage: number) => doFetch(targetPage, externalCode, receiverName, startDate, endDate),
    [doFetch, externalCode, receiverName, startDate, endDate]
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
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      doFetch(1, "", "", "", "");
    });
  }, [doFetch]);

  const hasFilters = externalCode || receiverName || startDate || endDate;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3 shrink-0">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">外部编码</label>
          <input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入外部编码..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">收件人姓名</label>
          <input
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入收件人姓名..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">结束日期</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-400 transition-colors"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-sm transition-colors shrink-0"
            >
              搜索
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-sm transition-colors shrink-0"
                title="清除筛选"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden flex-1 min-h-0">
        <div className="h-full overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800">
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">#</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">外部编码</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">发件人</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">发件电话</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件人</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件电话</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">收件地址</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">重量</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">件数</th>
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">温层</th>
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
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <span>加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    {hasFilters ? "未找到匹配的运单记录" : "暂无运单记录"}
                  </td>
                </tr>
              ) : (
                orders.map((order, i) => (
                  <tr key={order.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-2 text-gray-500">{(page - 1) * pageSize + i + 1}</td>
                    <td className="p-2 text-gray-200 font-mono max-w-[140px] truncate" title={order.external_code}>
                      {order.external_code || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">{order.sender_name}</td>
                    <td className="p-2 text-gray-200 whitespace-nowrap font-mono text-[11px]">{order.sender_phone}</td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">{order.receiver_name}</td>
                    <td className="p-2 text-gray-200 whitespace-nowrap font-mono text-[11px]">{order.receiver_phone}</td>
                    <td className="p-2 text-gray-200 max-w-[200px] truncate" title={order.receiver_address}>
                      {order.receiver_address}
                    </td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">{order.weight}kg</td>
                    <td className="p-2 text-gray-200 text-center">{order.piece_count}</td>
                    <td className="p-2 text-gray-200 whitespace-nowrap">{order.temperature_level}</td>
                    <td className="p-2 text-gray-400 max-w-[120px] truncate" title={order.remark}>
                      {order.remark || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="p-2 text-gray-500 font-mono text-[10px] max-w-[110px] truncate" title={order.batch_id}>
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
                      p === page ? "bg-indigo-500/30 text-indigo-300 font-medium" : "hover:text-white"
                    }`}
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
