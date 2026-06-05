"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state">
      <svg
        className="empty-state-svg"
        width="140"
        height="120"
        viewBox="0 0 140 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: 16 }}
      >
        {/* 背景圈 */}
        <ellipse cx="70" cy="100" rx="50" ry="6" fill="currentColor" opacity="0.06" />
        {/* 文档主体 */}
        <rect x="35" y="10" width="70" height="85" rx="6" fill="currentColor" opacity="0.10" />
        <rect x="37" y="12" width="66" height="81" rx="5" fill="currentColor" opacity="0.06" />
        {/* 文档线条 */}
        <line x1="50" y1="32" x2="90" y2="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
        <line x1="50" y1="44" x2="80" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.15" />
        <line x1="50" y1="56" x2="85" y2="56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.12" />
        <line x1="50" y1="68" x2="75" y2="68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.08" />
        {/* 放大镜 */}
        <circle cx="88" cy="48" r="18" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
        <line x1="101" y1="61" x2="112" y2="72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
      </svg>
      <div className="empty-state-title" style={{ fontSize: 15, fontWeight: 500, color: "var(--ztocc-text-secondary, #909399)", marginBottom: 4 }}>
        {title}
      </div>
      {description && (
        <div className="empty-state-desc" style={{ fontSize: 12, color: "var(--ztocc-text-placeholder, #a8abb2)", marginBottom: 16 }}>
          {description}
        </div>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
