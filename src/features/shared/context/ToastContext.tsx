'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Portal Container */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => {
          // Color styles based on type
          let bgColor = '#1A1A22';
          let borderColor = '#25252E';
          let iconColor = '#E5C158';
          let textColor = '#FFFFFF';

          if (toast.type === 'success') {
            bgColor = 'rgba(16, 185, 129, 0.1)';
            borderColor = '#10B981';
            iconColor = '#10B981';
          } else if (toast.type === 'error') {
            bgColor = 'rgba(229, 9, 20, 0.1)';
            borderColor = '#E50914';
            iconColor = '#E50914';
          }

          return (
            <div
              key={toast.id}
              onClick={() => removeToast(toast.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                color: textColor,
                fontSize: '0.95rem',
                cursor: 'pointer',
                pointerEvents: 'auto',
                userSelect: 'none',
                animation: 'toastFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Icon indicator */}
              <span style={{
                color: iconColor,
                fontWeight: 'bold',
                fontSize: '1.2rem',
                minWidth: '20px'
              }}>
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✕'}
                {toast.type === 'info' && 'ℹ'}
              </span>
              <span style={{ flex: 1, lineHeight: '1.4' }}>{toast.message}</span>
            </div>
          );
        })}
      </div>

      {/* Global CSS for Animations */}
      <style jsx global>{`
        @keyframes toastFadeIn {
          from {
            opacity: 0;
            transform: translateY(-16px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
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
