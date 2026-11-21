import React from 'react';
import { Check, X } from 'lucide-react';
import type { ToastMessage } from '../types/brush';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      id="toast-container"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          id="toast"
          role="status"
          className="pointer-events-auto animate-toast-in flex items-start justify-between gap-3 rounded-xl border border-[#BEF264] bg-[#000000] px-4 py-3 text-[#FFFFFF] shadow-[0_12px_32px_rgba(0,0,0,0.85)]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#BEF264] text-[#000000]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#FFFFFF]">{toast.title}</p>
              {toast.detail && (
                <p className="mt-0.5 truncate font-mono text-xs text-[#BEF264]">
                  {toast.detail}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-[#FFFFFF]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
