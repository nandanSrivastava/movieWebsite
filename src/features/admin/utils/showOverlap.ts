// A one-screen hall can't run two films at once.

const ROUND_TIME_MINUTES = 15; // Clearing the hall between shows

const startMs = (date: string, time: string) => {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}+05:30`).getTime();
};

export interface ScheduledShow {
  show_date: string;
  show_time: string;
  durationMinutes: number;
  title?: string;
}

/**
 * The first show that would still be running (or clearing) when this slot
 * starts, or that starts before this film has finished.
 */
export function findOverlap(slot: ScheduledShow, others: ScheduledShow[]): ScheduledShow | null {
  const start = startMs(slot.show_date, slot.show_time);
  const end = start + (slot.durationMinutes + ROUND_TIME_MINUTES) * 60_000;
  return others.find((other) => {
    const otherStart = startMs(other.show_date, other.show_time);
    const otherEnd = otherStart + (other.durationMinutes + ROUND_TIME_MINUTES) * 60_000;
    return start < otherEnd && otherStart < end;
  }) ?? null;
}
