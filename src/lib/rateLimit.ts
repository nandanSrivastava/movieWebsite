import { NextResponse } from 'next/server';

class MemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Evaluates if a given IP has exceeded request limit thresholds.
   * @param ip The client IP address to limit.
   * @param limit Max allowed requests within window.
   * @param durationMs Time window duration in milliseconds.
   */
  public isRateLimited(ip: string, limit = 15, durationMs = 60000): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];

    // Filter out timestamps outside the current sliding window
    const activeTimestamps = timestamps.filter((t) => now - t < durationMs);

    if (activeTimestamps.length >= limit) {
      return true;
    }

    activeTimestamps.push(now);
    this.requests.set(ip, activeTimestamps);
    return false;
  }
}

// Singleton instance to preserve state in server processes
export const rateLimiter = new MemoryRateLimiter();
