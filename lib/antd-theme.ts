import type { ThemeConfig } from "antd";
import { theme } from "antd";

const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#6366F1",
    colorBgContainer: "rgba(15, 15, 30, 0.6)",
    borderRadius: 12,
    fontFamily: "inherit",
    colorText: "#e5e7eb",
    colorTextSecondary: "#9ca3af",
    colorBorder: "rgba(99, 102, 241, 0.15)",
    colorBgElevated: "#1a1a2e",
    colorBgMask: "rgba(0, 0, 0, 0.6)",
  },
};

export default antdTheme;
