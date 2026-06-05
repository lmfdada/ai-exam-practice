import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
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
  title: "万能导入 V2 | 智能多格式批量下单系统",
  description: "AI 考试：智能多格式批量下单系统，支持 Excel/Word/PDF 多种格式",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
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
            {children}
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
