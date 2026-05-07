import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigProvider, App } from "antd";
import theme from "@/lib/antd-theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI 智能留言板",
  description: "全栈 AI 应用 — 留言板 + AI 聊天助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-gray-950 text-gray-100 relative">
        <div className="fixed inset-0 bg-gradient-to-br from-amber-400/5 via-amber-300/3 to-transparent pointer-events-none" />
        <div className="fixed inset-0 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent pointer-events-none" />
        <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-300/8 via-amber-400/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="fixed top-0 left-1/3 w-96 h-[800px] bg-gradient-to-b from-amber-200/4 to-transparent -skew-x-12 pointer-events-none" />
        <ConfigProvider theme={theme}>
          <App>{children}</App>
        </ConfigProvider>
      </body>
    </html>
  );
}
