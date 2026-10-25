/**
 * Opening-rush load test for a STAGING deployment (never production).
 *
 *   k6 run -e BASE_URL=https://your-staging-url -e SHOW_ID=<uuid of a future show> scripts/load/seat-map.k6.js
 *
 * Simulates people sitting on one show's seat map (polling like the real
 * page, every ~10-13s) while a smaller group tries to hold seats.
 * Watch: p95 latency, 5xx rate, Supabase CPU/egress, Vercel invocations.
 * Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const SHOW_ID = __ENV.SHOW_ID;

export const options = {
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '1m', target: 0 },
      ],
    },
    holding: {
      executor: 'constant-arrival-rate',
      exec: 'hold',
      rate: 5,
      timeUnit: '1s',
      duration: '6m',
      startTime: '1m',
      preAllocatedVUs: 20,
    },
  },
  thresholds: {
    'http_req_failed{scenario:browsing}': ['rate<0.01'],
    'http_req_duration{scenario:browsing}': ['p(95)<800'],
  },
};

export function browse() {
  const res = http.get(`${BASE_URL}/api/seats/status?showId=${SHOW_ID}`);
  check(res, { 'seat map 200': r => r.status === 200 });
  sleep(10 + Math.random() * 3);
}

export function hold() {
  const map = http.get(`${BASE_URL}/api/seats/status?showId=${SHOW_ID}`);
  const free = (map.json('seats') || []).filter(s => s.status === 'available');
  if (free.length === 0) return;
  const seat = free[Math.floor(Math.random() * free.length)].seat_layout_id;
  const res = http.post(`${BASE_URL}/api/seats/lock`, JSON.stringify({ showId: SHOW_ID, seatLayoutIds: [seat] }), {
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
  });
  // 409 (someone else got it first) and 429 (per-IP limits: k6 runs from one IP) are expected
  check(res, { 'hold handled': r => [200, 409, 429].includes(r.status) });
}
