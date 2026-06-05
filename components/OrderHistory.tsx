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
      <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
        <input
          value={externalCode}
          onChange={(e) => setExternalCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="外部编码"
          className="input"
          style={{ width: 140, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <input
          value={receiverStore}
          onChange={(e) => setReceiverStore(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="收货门店"
          className="input"
          style={{ width: 140, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <input
          value={receiverName}
          onChange={(e) => setReceiverName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="收件人姓名"
          className="input"
          style={{ width: 140, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <input
          value={skuName}
          onChange={(e) => setSkuName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SKU物品名称"
          className="input"
          style={{ width: 140, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input"
          style={{ width: 150, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <span style={{ color: "var(--ztocc-text-placeholder)", fontSize: 13 }}>至</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input"
          style={{ width: 150, height: 32, padding: "0 10px", fontSize: 13 }}
        />
        <button onClick={handleSearch} className="btn btn-primary" style={{ height: 32, fontSize: 13 }}>
          查询
        </button>
        <button onClick={clearFilters} className="btn btn-secondary" style={{ height: 32, fontSize: 13 }}>
          重置
        </button>
      </div>

      {/* 表格 */}
      <div className="table-container flex-1 min-h-0"
           style={{ borderColor: "var(--ztocc-table-border)" }}>
        <div className="h-full overflow-auto">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>外部编码</th>
                <th>收货门店</th>
                <th>收件人姓名</th>
                <th>收件人电话</th>
                <th>收件人地址</th>
                <th>SKU物品编码</th>
                <th>SKU物品名称</th>
                <th>SKU数量</th>
                <th>SKU规格型号</th>
                <th>备注</th>
                <th>批次号</th>
                <th>提交时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center"
                      style={{ color: "var(--ztocc-text-secondary)" }}>
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin"
                           style={{ borderColor: "var(--ztocc-primary)", borderTopColor: "transparent" }} />
                      <span>加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center"
                      style={{ color: "var(--ztocc-text-secondary)" }}>
                    <div style={{ padding: "20px 0" }}>
                      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>
                        {hasFilters ? "🔍" : "📋"}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ztocc-text-secondary)", marginBottom: 4 }}>
                        {hasFilters ? "未找到匹配的记录" : "暂无历史数据"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ztocc-text-placeholder)", marginBottom: 16 }}>
                        {hasFilters
                          ? "尝试调整筛选条件或清除筛选"
                          : "完成导入下单后，运单数据将在此显示"}
                      </div>
                      {hasFilters && (
                        <button className="btn btn-sm btn-secondary" onClick={clearFilters}>
                          清除筛选
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order, i) => (
                  <tr key={order.id}
                      className="border-t transition-colors"
                      style={{
                        borderColor: "var(--ztocc-table-border)",
                        color: "var(--ztocc-text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--ztocc-table-row-hover)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                  >
                    <td className="p-2" style={{ color: "var(--ztocc-text-placeholder)" }}>
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td className="p-2 font-mono truncate max-w-[120px]" title={order.external_code}
                        style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.external_code || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.receiver_store || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.receiver_name || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap font-mono text-[11px]"
                        style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.receiver_phone || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 truncate max-w-[180px]" title={order.receiver_address}
                        style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.receiver_address || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 font-mono text-[11px]" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.sku_code || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.sku_name || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.sku_qty ?? <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2" style={{ color: "var(--ztocc-text-primary)" }}>
                      {order.sku_spec || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 truncate max-w-[120px]" title={order.remark}
                        style={{ color: "var(--ztocc-text-secondary)" }}>
                      {order.remark || <span style={{ color: "var(--ztocc-text-placeholder)" }}>-</span>}
                    </td>
                    <td className="p-2 font-mono text-[10px] truncate max-w-[100px]" title={order.batch_id}
                        style={{ color: "var(--ztocc-text-placeholder)" }}>
                      {order.batch_id}
                    </td>
                    <td className="p-2 whitespace-nowrap text-[11px]"
                        style={{ color: "var(--ztocc-text-placeholder)" }}>
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
        <div className="flex items-center justify-between mt-4 text-xs shrink-0"
             style={{ color: "var(--ztocc-text-secondary)" }}>
          <span>共 {total} 条 · 本页 {orders.length} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchOrders(1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
              style={{ color: "var(--ztocc-text-secondary)" }}
              onMouseEnter={(e) => { if (!(page <= 1)) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ztocc-text-secondary)"; }}
              title="首页"
            >
              ◀◀
            </button>
            <button
              onClick={() => fetchOrders(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
              style={{ color: "var(--ztocc-text-secondary)" }}
              onMouseEnter={(e) => { if (!(page <= 1)) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ztocc-text-secondary)"; }}
              title="上一页"
            >
              ◀
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 &&
                    <span className="px-1 select-none" style={{ color: "var(--ztocc-text-placeholder)" }}>...</span>}
                  <button
                    onClick={() => fetchOrders(p)}
                    className={`px-2.5 py-1 rounded transition-colors`}
                    style={
                      p === page
                        ? { background: "var(--ztocc-primary-bg)", color: "var(--ztocc-primary)", fontWeight: 500 }
                        : { color: "var(--ztocc-text-secondary)" }
                    }
                    onMouseEnter={(e) => {
                      if (p !== page) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-primary)";
                    }}
                    onMouseLeave={(e) => {
                      if (p !== page) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-text-secondary)";
                    }}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => fetchOrders(page + 1)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
              style={{ color: "var(--ztocc-text-secondary)" }}
              onMouseEnter={(e) => { if (!(page >= totalPages)) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ztocc-text-secondary)"; }}
              title="下一页"
            >
              ▶
            </button>
            <button
              onClick={() => fetchOrders(totalPages)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
              style={{ color: "var(--ztocc-text-secondary)" }}
              onMouseEnter={(e) => { if (!(page >= totalPages)) (e.currentTarget as HTMLElement).style.color = "var(--ztocc-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ztocc-text-secondary)"; }}
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
