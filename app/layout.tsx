"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider, theme as antTheme } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppProvider, useApp } from "@/lib/app-context";
import { ToastProvider } from "@/components/Toast";
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
  { href: "/import", icon: "📦" },
  { href: "/history", icon: "📋" },
  { href: "/rules", icon: "⚙️" },
];

const PAGE_TITLE_KEYS: Record<string, string> = {
  "/import": "nav.import",
  "/history": "nav.history",
  "/rules": "nav.rules",
};

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activePath = pathname === "/" ? "/import" : pathname;
  const { t, lang, theme: appTheme, sidebarOpen, setSidebarOpen, toggleLang, toggleTheme } = useApp();
  const pageTitleKey = PAGE_TITLE_KEYS[activePath] || "app.title";
  const pageTitle = t(pageTitleKey);

  useEffect(() => {
    document.title = `${pageTitle} | ${t("app.title")} | ${t("app.subtitle")}`;
  }, [pageTitle, t]);

  return (
    <ConfigProvider
      theme={{
        algorithm: appTheme === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#0fc6c2",
          borderRadius: 4,
          colorBorder: "#dcdfe6",
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
        {/* ===== 遮罩（移动端） ===== */}
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ===== 侧边栏 ===== */}
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
          <div className="sidebar-logo">
            <div
              className="sidebar-logo-img"
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: "linear-gradient(135deg, #0fc6c2, #0da8a4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: "bold",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(15, 198, 194, 0.3)",
              }}
            >
              鲸
            </div>
            <div>
              <div className="sidebar-logo-text">{t("app.title")}</div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.2,
                }}
              >
                {t("app.subtitle")}
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
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{t(PAGE_TITLE_KEYS[item.href])}</span>
              </Link>
            ))}
          </nav>

          <div className="sidebar-footer">{t("sidebar.footer")}</div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* 汉堡按钮 */}
              <button
                className="hamburger-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle sidebar"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
              </button>
              <span className="top-header-brand">鲸天</span>
              <span className="top-header-brand-divider" />
              <div className="top-header-title">{pageTitle}</div>
            </div>
            <div className="top-header-right">
              {/* 品牌标识 */}
              <span className="top-header-badge">ZTOCC</span>
              {/* 主题切换 */}
              <button
                className="header-icon-btn"
                onClick={toggleTheme}
                title={t(appTheme === "light" ? "theme.dark" : "theme.light")}
              >
                {appTheme === "light" ? "🌙" : "☀️"}
              </button>
              {/* 语言切换 */}
              <button className="header-icon-btn" onClick={toggleLang}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{lang === "zh" ? "EN" : "中"}</span>
              </button>
              <span>{t("header.admin")}</span>
            </div>
          </header>

          {/* 主内容区 */}
          <main className="main-content">{children}</main>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>万能导入 V2 | 智能多格式批量下单系统</title>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AntdRegistry>
          <AppProvider>
            <ToastProvider>
              <LayoutInner>{children}</LayoutInner>
            </ToastProvider>
          </AppProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
