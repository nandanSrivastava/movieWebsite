'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Errors stay longer: they usually ask the person to do something
const DURATION: Record<ToastType, number> = { success: 4000, info: 4500, error: 7000 };
const MAX_VISIBLE = 3;
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // The same message twice (double click, a re-render) refreshes the one on screen
    const id = `${type}:${message}`;
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => removeToast(id), DURATION[type]));
    setToasts((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      return [...rest, { id, message, type }].slice(-MAX_VISIBLE);
    });
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Always mounted, so screen readers hear new messages */}
      <div className={styles.stack} aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              className={`${styles.toast} ${styles[toast.type]}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <Icon aria-hidden />
              <span className={styles.message}>{toast.message}</span>
              <button type="button" className={styles.close} onClick={() => removeToast(toast.id)} aria-label="Dismiss">
                <X aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
