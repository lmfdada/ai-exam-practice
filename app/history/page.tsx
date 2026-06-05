"use client";

import OrderHistory from "@/components/OrderHistory";

export default function HistoryPage() {
  return (
    <div className="main-content-card" style={{ overflow: "hidden", padding: 16, height: "100%" }}>
      <OrderHistory />
    </div>
  );
}
