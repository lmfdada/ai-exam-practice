"use client";

import { useState, useCallback, useRef } from "react";

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
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const totalPages = Math.ceil(total / pageSize);

  const doFetch = useCallback(async (targetPage: number, kw: string, sd: string, ed: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(pageSize));
      if (kw) params.set("keyword", kw);
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

  const initRef = useRef(false);
  if (!initRef.current) {
    initRef.current = true;
    setTimeout(() => doFetch(1, keyword, startDate, endDate), 0);
  }

  const fetchOrders = useCallback(
    (targetPage: number) => doFetch(targetPage, keyword, startDate, endDate),
    [doFetch, keyword, startDate, endDate]
  );

  const handleSearch = useCallback(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索外部编码 / 收件人 / 发件人..."
          className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-400 transition-colors"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-gray-200 outline-none focus:border-indigo-400 transition-colors"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-gray-200 outline-none focus:border-indigo-400 transition-colors"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-sm transition-colors"
        >
          搜索
        </button>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800">
                <th className="p-2 text-left text-gray-300 font-medium whitespace-nowrap">ID</th>
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
                    <div className="inline-block w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2">加载中...</span>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    暂无运单记录
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-2 text-gray-500">{order.id}</td>
                    <td className="p-2 text-gray-200 font-mono">{order.external_code || "-"}</td>
                    <td className="p-2 text-gray-200">{order.sender_name}</td>
                    <td className="p-2 text-gray-200">{order.sender_phone}</td>
                    <td className="p-2 text-gray-200">{order.receiver_name}</td>
                    <td className="p-2 text-gray-200">{order.receiver_phone}</td>
                    <td className="p-2 text-gray-200 max-w-[200px] truncate" title={order.receiver_address}>
                      {order.receiver_address}
                    </td>
                    <td className="p-2 text-gray-200">{order.weight}kg</td>
                    <td className="p-2 text-gray-200">{order.piece_count}</td>
                    <td className="p-2 text-gray-200">{order.temperature_level}</td>
                    <td className="p-2 text-gray-400 max-w-[150px] truncate" title={order.remark}>
                      {order.remark || "-"}
                    </td>
                    <td className="p-2 text-gray-500 font-mono text-[10px]">{order.batch_id}</td>
                    <td className="p-2 text-gray-500 whitespace-nowrap">
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
        <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
          <span>共 {total} 条 · 本页 {orders.length} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchOrders(1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded-lg disabled:opacity-30 hover:text-white transition-colors"
            >
              ◀◀
            </button>
            <button
              onClick={() => fetchOrders(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded-lg disabled:opacity-30 hover:text-white transition-colors"
            >
              ◀
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-gray-600">...</span>}
                  <button
                    onClick={() => fetchOrders(p)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      p === page ? "bg-indigo-500/30 text-indigo-300" : "hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => fetchOrders(page + 1)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded-lg disabled:opacity-30 hover:text-white transition-colors"
            >
              ▶
            </button>
            <button
              onClick={() => fetchOrders(totalPages)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded-lg disabled:opacity-30 hover:text-white transition-colors"
            >
              ▶▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
