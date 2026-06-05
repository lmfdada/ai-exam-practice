"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

const BG_COLORS: Record<ToastType, string> = {
  success: "var(--success-bg, rgba(23,201,100,0.08))",
  error: "var(--danger-bg, rgba(255,0,0,0.08))",
  warning: "var(--warning-bg, rgba(245,165,36,0.08))",
  info: "var(--ztocc-primary-bg, rgba(15,198,194,0.08))",
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: "rgba(23,201,100,0.25)",
  error: "rgba(255,0,0,0.25)",
  warning: "rgba(245,165,36,0.25)",
  info: "rgba(15,198,194,0.25)",
};

const TEXT_COLORS: Record<ToastType, string> = {
  success: "var(--ztocc-success, #17c964)",
  error: "var(--ztocc-danger, #ff0000)",
  warning: "var(--ztocc-warning, #f5a524)",
  info: "var(--ztocc-primary, #0fc6c2)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: "var(--ztocc-border-radius-base, 4px)",
              background: BG_COLORS[t.type],
              border: `1px solid ${BORDER_COLORS[t.type]}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              minWidth: 240,
              maxWidth: 420,
              animation: "slideInRight 0.3s ease-out, fadeIn 0.3s ease-out",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: TEXT_COLORS[t.type],
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {ICONS[t.type]}
            </span>
            <span style={{ fontSize: 13, color: "var(--ztocc-text-primary, #303133)", lineHeight: 1.4 }}>
              {t.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
