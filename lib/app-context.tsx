"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// ===== 国际化字典 =====
const ZH: Record<string, string> = {
  "app.title": "万能导入 V2",
  "app.subtitle": "智能多格式批量下单系统",
  "nav.import": "导入下单",
  "nav.history": "历史运单",
  "nav.rules": "规则管理",
  "header.admin": "管理员",
  "import.title": "导入下单",
  "history.title": "历史运单",
  "rules.title": "规则管理",
  "theme.light": "明亮",
  "theme.dark": "暗黑",
  "lang.switch": "English",
  "sidebar.footer": "V2.0 · AI 考试",
  "rules.create": "+ 新建规则",
  "rules.search": "搜索规则名称或描述...",
  "rules.empty": "暂无规则",
  "rules.emptyHint": "点击上方「新建规则」按钮创建第一条规则",
  "rules.noMatch": "未找到匹配的规则",
  "rules.noMatchHint": "尝试其他关键词",
  "rules.total": "共 {count} 条规则",
  "rules.used": "已使用 {count} 次",
  "rules.copy": "复制",
  "rules.delete": "删除",
  "rules.ai": "AI",
};

const EN: Record<string, string> = {
  "app.title": "Universal Import V2",
  "app.subtitle": "Smart Multi-format Batch Ordering System",
  "nav.import": "Import Orders",
  "nav.history": "Order History",
  "nav.rules": "Rule Management",
  "header.admin": "Admin",
  "import.title": "Import Orders",
  "history.title": "Order History",
  "rules.title": "Rule Management",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "lang.switch": "中文",
  "sidebar.footer": "V2.0 · AI Exam",
  "rules.create": "+ New Rule",
  "rules.search": "Search rule name or description...",
  "rules.empty": "No rules yet",
  "rules.emptyHint": "Click the button above to create your first rule",
  "rules.noMatch": "No matching rules found",
  "rules.noMatchHint": "Try different keywords",
  "rules.total": "Total {count} rules",
  "rules.used": "Used {count} times",
  "rules.copy": "Copy",
  "rules.delete": "Delete",
  "rules.ai": "AI",
};

type Lang = "zh" | "en";
type Theme = "light" | "dark";

interface AppContextValue {
  lang: Lang;
  theme: Theme;
  sidebarOpen: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  toggleLang: () => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app-lang") as Lang) || "zh";
    }
    return "zh";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app-theme") as Theme) || "light";
    }
    return "light";
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 主题切换时更新 html class 和 localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("app-lang", lang);
  }, [lang]);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const dict = lang === "zh" ? ZH : EN;
    let text = dict[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }, [lang]);

  const toggleLang = useCallback(() => setLang((prev) => (prev === "zh" ? "en" : "zh")), []);
  const toggleTheme = useCallback(() => setTheme((prev) => (prev === "light" ? "dark" : "light")), []);

  // 响应式: 小屏幕自动隐藏侧边栏
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(!e.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <AppContext.Provider value={{ lang, theme, sidebarOpen, t, toggleLang, toggleTheme, setSidebarOpen }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
