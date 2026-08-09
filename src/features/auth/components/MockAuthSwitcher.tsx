'use client';

import React, { useState } from 'react';
import { useCineBookAuth } from '../context/AuthContext';

export default function MockAuthSwitcher() {
  const { user, isMock, switchMockRole } = useCineBookAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Switcher is only rendered during Mock development mode
  if (!isMock) return null;

  const currentRole = user?.role || 'anonymous';

  const roleColors: Record<string, string> = {
    admin: '#10B981',       // Emerald Green
    member: '#F59E0B',      // Amber
    user: '#3B82F6',        // Blue
    anonymous: '#EF4444'    // Red
  };

  const roles: { label: string; value: 'admin' | 'member' | 'user' | 'anonymous' }[] = [
    { label: 'System Admin', value: 'admin' },
    { label: 'Counter Staff', value: 'member' },
    { label: 'Standard Customer', value: 'user' },
    { label: 'Anonymous Guest', value: 'anonymous' }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '24px',
      zIndex: 99999,
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: '#1A1A22',
          border: '1px solid #25252E',
          borderRadius: '30px',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6)',
          color: '#FFFFFF',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: roleColors[currentRole],
          display: 'inline-block',
          boxShadow: `0 0 8px ${roleColors[currentRole]}`
        }} />
        Dev Mode: {currentRole.toUpperCase()}
      </button>

      {/* Expanded Selector Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '50px',
          left: '0',
          backgroundColor: '#16161E',
          border: '1px solid #25252E',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.7)',
          padding: '16px',
          width: '220px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          animation: 'switcherSlideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <div style={{
            fontSize: '0.75rem',
            color: '#626270',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px'
          }}>
            Switch Mock Role
          </div>

          {roles.map((r) => {
            const isActive = currentRole === r.value;
            return (
              <button
                key={r.value}
                onClick={() => {
                  switchMockRole(r.value);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#A0A0B0',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#A0A0B0';
                }}
              >
                {r.label}
                {isActive && (
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: roleColors[r.value] + '20',
                    color: roleColors[r.value]
                  }}>
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Slide Up Animation Style */}
      <style jsx>{`
        @keyframes switcherSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
