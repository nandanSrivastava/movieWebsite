'use client';

import { useEffect, useState } from 'react';

// Phones with a wrong clock must not close booking early or hide showtimes, so
// anything that compares against "now" uses the server's time. Measured once per
// page load and shared; the difference doesn't change in that time.
let measured: number | null = null;
let measuring: Promise<number | null> | null = null;

function measureOffset(): Promise<number | null> {
  if (measured !== null) return Promise.resolve(measured);
  measuring ??= (async () => {
    try {
      const sentAt = Date.now();
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`health ${res.status}`);
      const { time } = await res.json();
      const receivedAt = Date.now();
      measured = new Date(time).getTime() - (sentAt + receivedAt) / 2;
      return measured;
    } catch {
      measuring = null; // Try again on the next page that asks
      return null;
    }
  })();
  return measuring;
}

/**
 * How far the server's clock is ahead of this device, in ms. Null until known:
 * callers must not act on the device clock alone while it's null, because a
 * wrong clock is exactly what this is here to catch.
 */
export function useServerOffset(): number | null {
  const [offset, setOffset] = useState<number | null>(measured);
  useEffect(() => {
    let cancelled = false;
    measureOffset().then((value) => { if (!cancelled) setOffset(value); });
    return () => { cancelled = true; };
  }, []);
  return offset;
}
