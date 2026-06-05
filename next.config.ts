import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 原生模块和 WebSocket 模块需要在服务端外部加载
  serverExternalPackages: [
    "better-sqlite3",
    "@neondatabase/serverless",
    "@napi-rs/canvas",
    "pdfjs-dist",
  ],
  // 本地构建时包含 better-sqlite3 原生模块
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/better-sqlite3/**/*"],
  },
};

export default nextConfig;
