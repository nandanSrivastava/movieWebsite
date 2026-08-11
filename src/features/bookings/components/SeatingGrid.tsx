import React from 'react';
import { SeatStatusType, ShowType } from '@/lib/db';

interface SeatingGridProps {
  sortedRows: string[];
  rowsMap: Record<string, SeatStatusType[]>;
  show: ShowType;
  selectedSeats: Set<string>;
  handleSeatClick: (seat: SeatStatusType) => void;
  user: any;
}

export default function SeatingGrid({ sortedRows, rowsMap, show, selectedSeats, handleSeatClick, user }: SeatingGridProps) {
  let lastCategory: string | null = null;

  return (
    <div style={{
      overflowX: 'auto',
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      paddingBottom: '20px',
      zIndex: 2
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 'fit-content' }}>
        {sortedRows.map((row) => {
          const rowSeats = rowsMap[row];
          const rowCategory = rowSeats[0]?.seat_layout?.category || 'normal';
          const renderCategoryHeader = rowCategory !== lastCategory;
          lastCategory = rowCategory;

          return (
            <React.Fragment key={row}>
              {renderCategoryHeader && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  margin: '24px 0 12px 0',
                  width: '100%',
                  justifyContent: 'center'
                }}>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    color: rowCategory === 'recliner' ? 'var(--highlight-gold)' : rowCategory === 'premium' ? '#3B82F6' : '#9CA3AF',
                    textTransform: 'uppercase',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    {rowCategory === 'recliner' ? '💎 VIP Recliner (₹' + show.price_recliner + ')' : rowCategory === 'premium' ? '✨ Premium Club (₹' + show.price_premium + ')' : '🎫 Classic Seat (₹' + show.price_normal + ')'}
                  </span>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
                <span style={{
                  width: '24px',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#9CA3AF',
                  fontSize: '0.9rem'
                }}>
                  {row}
                </span>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {rowSeats.map((seat) => {
                    const layoutId = seat.seat_layout_id;
                    const isCurrentSelected = selectedSeats.has(layoutId);
                    
                    const isBooked = seat.status === 'booked';
                    const isLockedByOther = !!(
                      seat.status === 'locked' && 
                      seat.locked_by !== user?.id && 
                      seat.lock_expires_at && 
                      new Date(seat.lock_expires_at).getTime() > Date.now()
                    );

                    const isRecliner = seat.seat_layout?.category === 'recliner';

                    let bg = 'var(--seat-available)';
                    let border = '1px solid var(--seat-available-border)';
                    let cursor = 'pointer';
                    let color = 'var(--text-secondary)';
                    let shadow = 'none';
                    let textDecor = 'none';

                    if (isBooked) {
                      bg = 'var(--seat-booked)';
                      border = '1px solid var(--seat-booked-border)';
                      color = 'var(--text-disabled)';
                      cursor = 'not-allowed';
                      textDecor = 'line-through';
                    } else if (isLockedByOther) {
                      bg = 'var(--seat-locked)';
                      border = '1px solid var(--seat-locked-border)';
                      color = 'var(--gold-400)';
                      cursor = 'not-allowed';
                    } else if (isCurrentSelected) {
                      bg = 'var(--seat-selected)';
                      border = '1px solid var(--seat-selected-border)';
                      color = 'var(--bg-void)';
                      shadow = '0 0 12px var(--gold-glow)';
                    } else if (isRecliner) {
                      border = '1px solid var(--border-gold)';
                      color = 'var(--gold-500)';
                    }

                    return (
                      <button
                        key={seat.id}
                        onClick={() => handleSeatClick(seat)}
                        disabled={isBooked || isLockedByOther}
                        title={`Row ${row} Seat ${seat.seat_layout?.seat_number} - ${seat.seat_layout?.category.toUpperCase()}`}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          backgroundColor: bg,
                          border: border,
                          color: color,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: cursor,
                          boxShadow: shadow,
                          textDecoration: textDecor,
                          transition: 'all 0.15s cubic-bezier(0.165, 0.84, 0.44, 1)'
                        }}
                      >
                        {seat.seat_layout?.seat_number}
                      </button>
                    );
                  })}
                </div>

                <span style={{
                  width: '24px',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#9CA3AF',
                  fontSize: '0.9rem'
                }}>
                  {row}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
