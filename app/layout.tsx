import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider, theme } from "antd";
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
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: "#0fc6c2",
                borderRadius: 8,
                colorBgContainer: "#161b22",
                colorBgElevated: "#1c2333",
                colorBorder: "#30363d",
                colorText: "#e6edf3",
                colorTextSecondary: "#8b949e",
                colorBgSpotlight: "rgba(15, 198, 194, 0.08)",
              },
              components: {
                Table: {
                  headerBg: "#1c2333",
                  borderColor: "#30363d",
                  rowHoverBg: "rgba(15, 198, 194, 0.03)",
                },
                Modal: {
                  contentBg: "#161b22",
                  headerBg: "#161b22",
                },
                Upload: {
                  colorBorder: "#30363d",
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
