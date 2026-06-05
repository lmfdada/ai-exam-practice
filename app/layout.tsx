"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const NAV_ITEMS = [
  { href: "/import", label: "导入下单", icon: "📦" },
  { href: "/history", label: "历史运单", icon: "📋" },
  { href: "/rules", label: "规则管理", icon: "⚙️" },
];

const PAGE_TITLES: Record<string, string> = {
  "/import": "导入下单",
  "/history": "历史运单",
  "/rules": "规则管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  // default to /import at root
  const activePath = pathname === "/" ? "/import" : pathname;
  const pageTitle = PAGE_TITLES[activePath] || "万能导入";

  useEffect(() => {
    document.title = `${pageTitle} | 万能导入 V2 | 智能多格式批量下单系统`;
  }, [pageTitle]);

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>万能导入 V2 | 智能多格式批量下单系统</title>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AntdRegistry>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#00b9b9",
                borderRadius: 4,
                colorBgContainer: "#fff",
                colorBgElevated: "#fff",
                colorBorder: "#dcdfe6",
                colorText: "#303133",
                colorTextSecondary: "#909399",
                colorBgSpotlight: "rgba(0, 185, 185, 0.08)",
              },
              components: {
                Table: {
                  headerBg: "#f5f7fa",
                  borderColor: "#ebeef5",
                  rowHoverBg: "#e6f9f9",
                },
                Modal: {
                  contentBg: "#fff",
                  headerBg: "#fff",
                },
                Upload: {
                  colorBorder: "#dcdfe6",
                },
              },
            }}
          >
            <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
              {/* ===== 侧边栏 ===== */}
              <aside className="sidebar">
                <div className="sidebar-logo">
                  <div
                    className="sidebar-logo-img"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      background: "linear-gradient(135deg, #00b9b9, #009999)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: "bold",
                      color: "#fff",
                    }}
                  >
                    M
                  </div>
                  <div>
                    <div className="sidebar-logo-text">万能导入</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.5)",
                        lineHeight: 1.2,
                      }}
                    >
                      批量下单系统
                    </div>
                  </div>
                </div>

                <nav className="sidebar-nav">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`sidebar-nav-item ${
                        activePath === item.href ? "active" : ""
                      }`}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </Link>
                  ))}
                </nav>

                <div className="sidebar-footer">V2.0 · AI 考试</div>
              </aside>

              {/* ===== 右侧区域 ===== */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* 顶部导航 */}
                <header className="top-header">
                  <div className="top-header-title">{pageTitle}</div>
                  <div className="top-header-right">
                    <span>管理员</span>
                  </div>
                </header>

                {/* 主内容区 */}
                <main className="main-content">{children}</main>
              </div>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
