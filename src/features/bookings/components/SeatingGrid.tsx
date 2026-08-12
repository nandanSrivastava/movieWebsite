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

// ── Layout constants matching the Dhrub Talkies hall sketch ─────
// Standard rows (G,F,E,D,C): Left[1-5] | Centre[6-13] | Right[14-18]
// Row A and B form an interlocking U-shape:
//   Line 1 (A_center): [empty] | A centre[6-13] | [empty]
//   Line 2 (B):        B left[1-5] | B centre[6-13] | B right[14-18]
//   Line 3 (A_sides):  A left[1-5] | [empty] | A right[14-18]
// Row P (Premium): Left[1-6] + Right[7-11] (different split)

function splitRow(row: string, seats: SeatStatusType[]) {
  const byNum = (s: SeatStatusType) => s.seat_layout?.seat_number ?? 0;

  if (row === 'P') {
    // Premium row: left 1-6, right 7-11
    return {
      left: seats.filter(s => byNum(s) <= 6),
      centre: [],
      right: seats.filter(s => byNum(s) >= 7),
    };
  }

  // Standard (G,F,E,D,C)
  return {
    left: seats.filter(s => byNum(s) <= 5),
    centre: seats.filter(s => byNum(s) >= 6 && byNum(s) <= 13),
    right: seats.filter(s => byNum(s) >= 14),
  };
}

// Pixel widths for each section so all rows align perfectly
const LEFT_W  = 5 * 28 + 4 * 5;  // 5 seats × 28px + 4 gaps × 5px = 160px
const CENTRE_W = 8 * 28 + 7 * 5; // 8 seats × 28px + 7 gaps × 5px = 259px
const RIGHT_W  = 5 * 28 + 4 * 5; // 5 seats × 28px + 4 gaps × 5px = 160px
const AISLE_W  = 24;

// Row display config
const ROW_META: Record<string, { label: string; sublabel?: string }> = {
  G: { label: 'G' }, F: { label: 'F' }, E: { label: 'E' },
  D: { label: 'D' }, C: { label: 'C' },
  A: { label: 'A' },
  B: { label: 'B' },
  P: { label: 'P', sublabel: 'Premium' },
};

function SeatBtn({ seat, isSelected, user, onClick }: {
  seat: SeatStatusType; isSelected: boolean; user: any; onClick: (s: SeatStatusType) => void;
}) {
  const isBooked = seat.status === 'booked';
  const isLockedByOther = !!(
    seat.status === 'locked' &&
    seat.locked_by !== user?.id &&
    seat.lock_expires_at &&
    new Date(seat.lock_expires_at).getTime() > Date.now()
  );
  const isPremium = seat.seat_layout?.category === 'premium';

  let bg = 'var(--seat-available)';
  let border = isPremium ? '1px solid var(--border-gold)' : '1px solid var(--seat-available-border)';
  let color = isPremium ? 'var(--gold-500)' : 'var(--text-secondary)';
  let cursor = 'pointer';
  let shadow = 'none';
  let textDecor = 'none';

  if (isBooked) {
    bg = 'var(--seat-booked)'; border = '1px solid var(--seat-booked-border)';
    color = 'var(--text-disabled)'; cursor = 'not-allowed'; textDecor = 'line-through';
  } else if (isLockedByOther) {
    bg = 'var(--seat-locked)'; border = '1px solid var(--seat-locked-border)';
    color = 'var(--gold-400)'; cursor = 'not-allowed';
  } else if (isSelected) {
    bg = 'var(--seat-selected)'; border = '1px solid var(--seat-selected-border)';
    color = 'var(--bg-void)'; shadow = '0 0 12px var(--gold-glow)';
  }

  return (
    <button
      onClick={() => onClick(seat)}
      disabled={isBooked || isLockedByOther}
      title={`Row ${seat.seat_layout?.row_label} Seat ${seat.seat_layout?.seat_number} — ${isPremium ? 'Premium' : 'Economy'}`}
      style={{
        width: '28px', height: '28px', borderRadius: '5px',
        backgroundColor: bg, border, color,
        fontSize: '0.68rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor, boxShadow: shadow, textDecoration: textDecor, flexShrink: 0,
        transition: 'all 0.15s cubic-bezier(0.165, 0.84, 0.44, 1)',
      }}
    >
      {seat.seat_layout?.seat_number}
    </button>
  );
}

function AisleGap() {
  return (
    <div style={{ width: `${AISLE_W}px`, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '2px', height: '20px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '1px' }} />
    </div>
  );
}

export default function SeatingGrid({ sortedRows, rowsMap, show, selectedSeats, handleSeatClick, user }: SeatingGridProps) {
  const economyPrice = (show as any).price_classic ?? (show as any).price_economy ?? (show as any).price_normal ?? 150;
  const premiumPrice = show.price_premium ?? 200;

  // Sort rows: G→C first, then A_center, B, A_sides, P
  const rowOrder = ['G', 'F', 'E', 'D', 'C', 'A_center', 'B', 'A_sides', 'P'];
  
  // Create a base array of physical rows to sort on, 
  // but we'll override A with virtual rows
  const orderedRows = rowOrder.filter(r => r !== 'A');

  let shownPriceHeader = false;

  return (
    <div className="seating-grid-container">
      <div className="seating-grid-inner">

        {/* Price category header (shown once) */}
        {(() => {
          if (shownPriceHeader) return null;
          shownPriceHeader = true;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0 4px', justifyContent: 'center' }}>
              <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1px',
                textTransform: 'uppercase', padding: '3px 14px', borderRadius: '20px',
                backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                whiteSpace: 'nowrap',
              }}>
                <span style={{ color: '#9CA3AF' }}>Classic</span>
                <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 6px' }}>—</span>
                <span style={{ color: '#9CA3AF', fontSize: '0.65rem' }}>₹{economyPrice}</span>
              </span>
              <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            </div>
          );
        })()}

        {orderedRows.map((row) => {
          let left: SeatStatusType[] = [];
          let centre: SeatStatusType[] = [];
          let right: SeatStatusType[] = [];
          let metaLeft: { label: string; sublabel?: string } = { label: row };
          let metaRight: { label: string; sublabel?: string } = { label: row };

          if (row === 'A_center') {
            const seatsA = rowsMap['A'] || [];
            if (!seatsA.length) return null;
            
            left = [];
            centre = seatsA.filter(s => { const n = s.seat_layout?.seat_number ?? 0; return n >= 6 && n <= 13; });
            right = [];
            metaLeft = ROW_META['A'];
            metaRight = ROW_META['A'];
          } else if (row === 'A_sides') {
            const seatsA = rowsMap['A'] || [];
            if (!seatsA.length) return null;

            left = seatsA.filter(s => (s.seat_layout?.seat_number ?? 0) <= 5);
            centre = [];
            right = seatsA.filter(s => (s.seat_layout?.seat_number ?? 0) >= 14);
            metaLeft = ROW_META['A'];
            metaRight = ROW_META['A'];
          } else {
            const rowSeats = rowsMap[row];
            if (!rowSeats || rowSeats.length === 0) return null;
            const split = splitRow(row, rowSeats);
            left = split.left; centre = split.centre; right = split.right;
            metaLeft = ROW_META[row] || { label: row };
            metaRight = metaLeft;
          }

          // Section divider before Premium row
          const showDivider = row === 'P';
          const isWalkway = row === 'A_center';

          return (
            <React.Fragment key={row}>
              {isWalkway && (
                <div style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.03)' }} />
                  <span style={{
                    fontSize: '0.55rem', fontWeight: 600, letterSpacing: '3px',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)',
                    padding: '0 15px',
                  }}>
                    Walkway
                  </span>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.03)' }} />
                </div>
              )}

              {showDivider && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 4px', justifyContent: 'center' }}>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: 'var(--highlight-gold)',
                    padding: '2px 10px', borderRadius: '12px',
                    border: '1px solid var(--border-gold)',
                    whiteSpace: 'nowrap',
                  }}>
                    🟡 Premium — ₹{premiumPrice}
                  </span>
                  <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Left row label */}
                <span style={{ width: '30px', textAlign: 'right', fontWeight: 700, color: '#6B7280', fontSize: '0.8rem', flexShrink: 0, marginRight: '8px' }}>
                  {metaLeft?.label}
                  {metaLeft?.sublabel && <span style={{ fontSize: '0.55rem', display: 'block', color: '#4B5563' }}>{metaLeft.sublabel}</span>}
                </span>

                {/* Left section [1-5] — empty placeholder if no seats */}
                <div style={{ width: `${LEFT_W}px`, flexShrink: 0, display: 'flex', gap: '5px' }}>
                  {left.map(seat => (
                    <SeatBtn key={seat.id} seat={seat} isSelected={selectedSeats.has(seat.seat_layout_id)} user={user} onClick={handleSeatClick} />
                  ))}
                </div>

                <AisleGap />

                {/* Centre section [6-13] — empty for rows B, S */}
                <div style={{ width: `${CENTRE_W}px`, flexShrink: 0, display: 'flex', gap: '5px' }}>
                  {centre.map(seat => (
                    <SeatBtn key={seat.id} seat={seat} isSelected={selectedSeats.has(seat.seat_layout_id)} user={user} onClick={handleSeatClick} />
                  ))}
                </div>

                <AisleGap />

                {/* Right section [14-18] */}
                <div style={{ width: `${RIGHT_W}px`, flexShrink: 0, display: 'flex', gap: '5px' }}>
                  {right.map(seat => (
                    <SeatBtn key={seat.id} seat={seat} isSelected={selectedSeats.has(seat.seat_layout_id)} user={user} onClick={handleSeatClick} />
                  ))}
                </div>

                {/* Right row label */}
                <span style={{ width: '30px', textAlign: 'left', fontWeight: 700, color: '#6B7280', fontSize: '0.8rem', flexShrink: 0, marginLeft: '8px' }}>
                  {metaRight?.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
