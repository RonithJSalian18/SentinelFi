"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "./ui";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

export const useToast = () => useContext(ToastContext);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const ICON_COLORS = { success: "text-good", error: "text-critical", info: "text-brand" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((toast: ToastInput) => {
    const id = ++nextId.current;
    setToasts((all) => [...all.slice(-3), { ...toast, id }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.action ? 9000 : 5000);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.id, toast.action]);

  const Icon = ICONS[toast.tone];
  return (
    <div
      role="status"
      className="animate-in pointer-events-auto flex gap-3 p-4 bg-surface border border-line rounded-xl shadow-pop"
    >
      <Icon className={cn("w-5 h-5 shrink-0", ICON_COLORS[toast.tone])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description && <p className="text-xs text-ink-2 mt-0.5 break-words">{toast.description}</p>}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 text-xs font-semibold text-brand hover:text-brand-strong"
          >
            {toast.action.label} →
          </button>
        )}
      </div>
      <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification" className="text-ink-3 hover:text-ink self-start">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
