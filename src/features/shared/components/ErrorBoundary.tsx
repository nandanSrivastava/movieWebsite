'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

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
    // In production, errors are captured here and logged to a monitoring service.
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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0F0F12',
          color: '#FFFFFF',
          padding: '24px',
          textAlign: 'center',
          fontFamily: "'Outfit', sans-serif"
        }}>
          <div style={{
            maxWidth: '500px',
            backgroundColor: '#1A1A22',
            padding: '40px',
            borderRadius: '16px',
            border: '1px solid #25252E',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(229, 9, 20, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              color: '#E50914',
              fontSize: '32px',
              fontWeight: 'bold'
            }}>
              !
            </div>
            <h2 style={{
              fontSize: '1.8rem',
              color: '#FFFFFF',
              marginBottom: '16px',
              fontWeight: 700
            }}>
              Something Went Wrong
            </h2>
            <p style={{
              color: '#A0A0B0',
              marginBottom: '32px',
              fontSize: '1rem',
              lineHeight: '1.6'
            }}>
              Dhrub Cineplex encountered a temporary issue loading this section. Your booking progress is saved on our servers.
            </p>
            <button 
              onClick={this.handleReload}
              style={{
                padding: '12px 32px',
                backgroundColor: '#E50914',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '1rem',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F81F2B'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#E50914'}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
