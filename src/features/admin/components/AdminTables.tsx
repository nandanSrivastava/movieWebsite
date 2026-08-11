'use client';

import React from 'react';

const formatTimeLabel = (timeStr: string) => {
  try {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
};

export default function AdminTables({ 
  activeLocks, 
  shows, 
  auditLogs, 
  actioning, 
  handleForceReleaseHold 
}: { 
  activeLocks: any[], 
  shows: any[], 
  auditLogs: any[], 
  actioning: string | null, 
  handleForceReleaseHold: (showId: string, seatLayoutId: string, seatLabel: string) => void 
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '30px'
    }}>
      
      {/* ROW 1: ACTIVE SEAT HOLDS OVERRIDE */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
          ⏳ Active Seat Holds & Locks
        </h3>

        {activeLocks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active temporary seat holds currently running.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px' }}>Movie</th>
                  <th style={{ padding: '12px' }}>Screen</th>
                  <th style={{ padding: '12px' }}>Seat</th>
                  <th style={{ padding: '12px' }}>Expires In</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeLocks.map((lock: any) => {
                  const timeLeft = Math.max(0, Math.round((new Date(lock.expiresAt).getTime() - Date.now()) / 1000));
                  const mins = Math.floor(timeLeft / 60);
                  const secs = timeLeft % 60;
                  return (
                    <tr key={lock.seatId} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{lock.movieTitle}</td>
                      <td style={{ padding: '12px' }}>{lock.screenName}</td>
                      <td style={{ padding: '12px', color: 'var(--accent-crimson)', fontWeight: 'bold' }}>{lock.seatLabel}</td>
                      <td style={{ padding: '12px', color: '#F59E0B' }}>{mins}:{secs.toString().padStart(2, '0')}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleForceReleaseHold(lock.showId, lock.seatLayoutId, lock.seatLabel)}
                          disabled={actioning === lock.seatLayoutId}
                          className="btn btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            color: '#EF4444'
                          }}
                        >
                          {actioning === lock.seatLayoutId ? 'Releasing...' : 'Release Hold'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROW 2: OCCUPANCY PANEL */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
          📊 Show Occupancy Telemetry
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {shows.map((show: any) => (
            <div 
              key={show.id}
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <strong style={{ fontSize: '0.95rem', display: 'block', color: '#FFFFFF' }}>{show.movie?.title}</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {show.screen?.name} • {formatTimeLabel(show.show_time)}
              </span>

              {/* Custom Occupancy Progress Bar */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span>Occupancy</span>
                  <strong>{show.occupancyRate}% ({show.bookedSeats}/{show.totalSeats} seats)</strong>
                </div>
                <div style={{ height: '8px', width: '100%', backgroundColor: '#25252E', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${show.occupancyRate}%`,
                    backgroundColor: show.occupancyRate > 75 ? '#10B981' : show.occupancyRate > 40 ? 'var(--highlight-gold)' : 'var(--accent-crimson)',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 3: RECENT AUDIT TRAIL LOGS */}
      <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
          📑 System Audit Trail
        </h3>

        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px' }}>Timestamp</th>
                <th style={{ padding: '12px' }}>Event</th>
                <th style={{ padding: '12px' }}>Details</th>
                <th style={{ padding: '12px' }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 50).map((log: any, index: number) => (
                <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {new Date(log.created_at || log.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backgroundColor: log.action.includes('SUCCESS') ? 'rgba(16, 185, 129, 0.12)' : log.action.includes('CONFLICT') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)',
                      color: log.action.includes('SUCCESS') ? '#10B981' : log.action.includes('CONFLICT') ? '#EF4444' : '#FFFFFF'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)', maxHeight: '40px', overflow: 'hidden' }}>
                    {JSON.stringify(log.details)}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{log.ip || 'Localhost'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
