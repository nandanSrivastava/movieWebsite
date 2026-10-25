'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError } from '@/lib/reportError';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside Dhrub Cineplex:', error, errorInfo);
    // Report to Sentry with the React component stack (no-op without a DSN).
    reportError(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? '' } },
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main role="alert" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: '460px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span aria-hidden style={{
              width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 28, fontWeight: 700,
            }}>!</span>
            <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Something went wrong</h1>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Dhrub Cineplex encountered a temporary issue loading this section. Your booking progress is saved on our servers.
            </p>
            <button onClick={this.handleReload} className="btn btn-primary" style={{ marginTop: 8 }}>
              Reload page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
