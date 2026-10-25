'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, Maximize2 } from 'lucide-react';
import { SeatStatusType, ShowType } from '@/lib/db';
import { categoryPrice, formatINR } from '@/features/shared/utils/format';
import CinemaScreen from './CinemaScreen';
import styles from './SeatingGrid.module.css';

interface SeatingGridProps {
  sortedRows: string[];
  rowsMap: Record<string, SeatStatusType[]>;
  show: ShowType;
  selectedSeats: Set<string>;
  handleSeatClick: (seat: SeatStatusType) => void;
  heldByMe: Set<string>;
  disabled?: boolean;
}

// ── Layout matching the Dhrub Talkies hall sketch ──────────────
// Standard rows (G,F,E,D,C): Left[1-5] | Centre[6-13] | Right[14-18]
// Rows A and B interlock in a U-shape:
//   Line 1 (A_center): [empty]     | A centre[6-13] | [empty]
//   Line 2 (B):        B left[1-5] | B centre[6-13] | B right[14-18]
//   Line 3 (A_sides):  A left[1-5] | [empty]        | A right[14-18]
// Row P (Premium): Left[1-6] + Right[7-11]
// Rows outside this sketch (another screen) are drawn after P as standard rows.
const ROW_ORDER = ['G', 'F', 'E', 'D', 'C', 'A_center', 'B', 'A_sides', 'P'];
const SKETCH_ROWS = new Set(['G', 'F', 'E', 'D', 'C', 'A', 'B', 'P']);

const SEAT = 32;
const GAP = 6;
const AISLE = 24;
const LABEL = 24;
const block = (n: number) => n * SEAT + (n - 1) * GAP;
const LEFT_W = block(5);
const CENTRE_W = block(8);
const RIGHT_W = block(5);
export const HALL_WIDTH = LABEL * 2 + 16 + LEFT_W + CENTRE_W + RIGHT_W + AISLE * 2;

// Below this scale seats are too small to tap, so a tap zooms in first
const TAP_ZOOM_THRESHOLD = 0.75;

const num = (s: SeatStatusType) => s.seat_layout?.seat_number ?? 0;

function splitRow(row: string, seats: SeatStatusType[]) {
  if (row === 'P') {
    return { left: seats.filter(s => num(s) <= 6), centre: [], right: seats.filter(s => num(s) >= 7) };
  }
  return {
    left: seats.filter(s => num(s) <= 5),
    centre: seats.filter(s => num(s) >= 6 && num(s) <= 13),
    right: seats.filter(s => num(s) >= 14),
  };
}

type Line = { key: string; label: string; left: SeatStatusType[]; centre: SeatStatusType[]; right: SeatStatusType[]; before?: 'walkway' | 'premium' };

function buildLines(rowsMap: Record<string, SeatStatusType[]>, sortedRows: string[]): Line[] {
  const lines: Line[] = [];
  for (const row of ROW_ORDER) {
    if (row === 'A_center' || row === 'A_sides') {
      const seatsA = rowsMap['A'] || [];
      if (!seatsA.length) continue;
      lines.push(row === 'A_center'
        ? { key: row, label: 'A', left: [], centre: seatsA.filter(s => num(s) >= 6 && num(s) <= 13), right: [], before: 'walkway' }
        : { key: row, label: 'A', left: seatsA.filter(s => num(s) <= 5), centre: [], right: seatsA.filter(s => num(s) >= 14) });
      continue;
    }
    const seats = rowsMap[row];
    if (!seats?.length) continue;
    lines.push({ key: row, label: row, ...splitRow(row, seats), before: row === 'P' ? 'premium' : undefined });
  }
  for (const row of sortedRows) {
    if (SKETCH_ROWS.has(row) || !rowsMap[row]?.length) continue;
    lines.push({ key: row, label: row, ...splitRow(row, rowsMap[row]) });
  }
  return lines;
}

function Seat({ seat, line, isSelected, heldByMe, onClick, disabled, tabbable, price }: {
  seat: SeatStatusType; line: number; isSelected: boolean; heldByMe: Set<string>;
  onClick: (s: SeatStatusType) => void; disabled: boolean; tabbable: boolean; price: number;
}) {
  const layout = seat.seat_layout;
  const isBooked = seat.status === 'booked';
  const isHeld = seat.status === 'locked' && !heldByMe.has(seat.seat_layout_id);
  const isPremium = layout?.category === 'premium';
  const unavailable = isBooked || isHeld || disabled;

  const where = `Row ${layout?.row_label}, seat ${layout?.seat_number}`;
  const label = isBooked ? `${where}, sold`
    : isHeld ? `${where}, held by another customer`
    : `${where}, ${isPremium ? 'Premium' : 'Classic'}, ${formatINR(price)}`;

  const state = isBooked ? styles.sold : isHeld ? styles.held : isSelected ? styles.selected : '';

  return (
    <button
      type="button"
      className={`${styles.seat} ${isPremium ? styles.premium : ''} ${state}`}
      onClick={() => { if (!unavailable || isSelected) onClick(seat); }}
      aria-label={label}
      aria-pressed={unavailable && !isSelected ? undefined : isSelected}
      aria-disabled={unavailable && !isSelected ? true : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-seat={seat.seat_layout_id}
      data-line={line}
    >
      <span aria-hidden>{layout?.seat_number}</span>
    </button>
  );
}

export default function SeatingGrid({ sortedRows, rowsMap, show, selectedSeats, handleSeatClick, heldByMe, disabled = false }: SeatingGridProps) {
  const lines = buildLines(rowsMap, sortedRows);
  const classicPrice = categoryPrice(show, 'classic');
  const premiumPrice = categoryPrice(show, 'premium');

  const viewportRef = useRef<HTMLDivElement>(null);
  const hallRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const pendingFocus = useRef<{ x: number; y: number; clientY: number } | null>(null);

  // Roving tab stop: one seat in the tab order, arrows move between seats
  const firstOpen = lines.flatMap(l => [...l.left, ...l.centre, ...l.right]).find(s => s.status === 'available');
  const [activeSeat, setActiveSeat] = useState<string | null>(null);
  const tabStop = activeSeat ?? firstOpen?.seat_layout_id ?? null;

  const canTapZoom = fitZoom < TAP_ZOOM_THRESHOLD;
  const zoom = zoomed ? 1 : fitZoom;

  const updateEdges = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      setFitZoom(Math.min(1, el.clientWidth / HALL_WIDTH));
      updateEdges();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges]);

  // After zooming in, keep the tapped spot under the finger
  useLayoutEffect(() => {
    const el = viewportRef.current;
    const hall = hallRef.current;
    if (!el || !hall) return;
    const focus = pendingFocus.current;
    if (focus && zoomed) {
      el.scrollLeft = focus.x * zoom - el.clientWidth / 2;
      const top = hall.getBoundingClientRect().top + focus.y * zoom;
      window.scrollBy({ top: top - focus.clientY, behavior: 'instant' as ScrollBehavior });
      pendingFocus.current = null;
    }
    if (!zoomed) el.scrollLeft = 0;
    updateEdges();
  }, [zoomed, zoom, updateEdges]);

  const zoomInAt = (clientX: number, clientY: number) => {
    const rect = hallRef.current!.getBoundingClientRect();
    pendingFocus.current = { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom, clientY };
    setZoomed(true);
  };

  // A pointer tap on the zoomed-out hall zooms in instead of picking a tiny seat.
  // Keyboard presses (detail === 0) always act on the seat.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!canTapZoom || zoomed || e.detail === 0) return;
    e.preventDefault();
    e.stopPropagation();
    zoomInAt(e.clientX, e.clientY);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const current = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-seat]');
    if (!current || !hallRef.current) return;
    e.preventDefault();
    const all = Array.from(hallRef.current.querySelectorAll<HTMLButtonElement>('button[data-seat]'));
    const line = Number(current.dataset.line);
    const sameLine = all.filter(b => Number(b.dataset.line) === line);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowLeft') next = sameLine[sameLine.indexOf(current) - 1];
    else if (e.key === 'ArrowRight') next = sameLine[sameLine.indexOf(current) + 1];
    else if (e.key === 'Home') next = sameLine[0];
    else if (e.key === 'End') next = sameLine[sameLine.length - 1];
    else {
      const lineNumbers = Array.from(new Set(all.map(b => Number(b.dataset.line))));
      const target = lineNumbers[lineNumbers.indexOf(line) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (target !== undefined) {
        const x = current.getBoundingClientRect().left;
        next = all.filter(b => Number(b.dataset.line) === target)
          .sort((a, b) => Math.abs(a.getBoundingClientRect().left - x) - Math.abs(b.getBoundingClientRect().left - x))[0];
      }
    }
    if (next) {
      setActiveSeat(next.dataset.seat!);
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const renderBlock = (seats: SeatStatusType[], width: number, lineIndex: number) => (
    <div className={styles.block} style={{ width }}>
      {seats.map(seat => (
        <Seat
          key={seat.id}
          seat={seat}
          line={lineIndex}
          isSelected={selectedSeats.has(seat.seat_layout_id)}
          heldByMe={heldByMe}
          onClick={(s) => { setActiveSeat(s.seat_layout_id); handleSeatClick(s); }}
          disabled={disabled}
          tabbable={seat.seat_layout_id === tabStop}
          price={seat.seat_layout?.category === 'premium' ? premiumPrice : classicPrice}
        />
      ))}
    </div>
  );

  return (
    <div className={styles.wrap}>
      {canTapZoom && (
        <div className={styles.toolbar}>
          <p className={styles.hint} aria-live="polite">
            {zoomed ? 'Swipe sideways to see the whole row' : 'Tap the part of the hall you want to sit in'}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoomed(z => !z)} aria-pressed={zoomed}>
            {zoomed ? <><Maximize2 aria-hidden />Whole hall</> : <><ZoomIn aria-hidden />Zoom in</>}
          </button>
        </div>
      )}

      <div
        className={styles.viewport}
        ref={viewportRef}
        onScroll={updateEdges}
        data-fade-left={edges.left || undefined}
        data-fade-right={edges.right || undefined}
      >
        <div
          ref={hallRef}
          className={`${styles.hall} ${zoom < TAP_ZOOM_THRESHOLD ? styles.overview : ''}`}
          style={{ width: HALL_WIDTH, zoom }}
          role="group"
          aria-label="Seat map. Use arrow keys to move between seats."
          onClickCapture={onClickCapture}
          onKeyDown={onKeyDown}
        >
          <CinemaScreen />

          <p className={styles.section}>
            <span>Classic</span><span className={styles.sectionPrice}>{formatINR(classicPrice)}</span>
          </p>

          {lines.map((line, i) => (
            <React.Fragment key={line.key}>
              {line.before === 'walkway' && <p className={styles.walkway}>Walkway</p>}
              {line.before === 'premium' && (
                <p className={`${styles.section} ${styles.sectionPremium}`}>
                  <span>Premium</span><span className={styles.sectionPrice}>{formatINR(premiumPrice)}</span>
                </p>
              )}
              <div className={styles.line}>
                <span className={styles.rowLabel} aria-hidden>{line.label}</span>
                {renderBlock(line.left, LEFT_W, i)}
                <span className={styles.aisle} aria-hidden />
                {renderBlock(line.centre, CENTRE_W, i)}
                <span className={styles.aisle} aria-hidden />
                {renderBlock(line.right, RIGHT_W, i)}
                <span className={styles.rowLabel} aria-hidden>{line.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
