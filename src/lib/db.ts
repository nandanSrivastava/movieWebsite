import 'server-only';
import { DatabaseClient, Movie, Show, SeatStatus, Booking, Profile } from './types';
import { MockDatabase } from './mockDb';
import { SupabaseDatabaseClient } from './supabaseDb';

// ── CLIENT SINGLETON EXPORT ───────────────────────────────────
const isSupabaseConfigured = 
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
  (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const globalRef = global as any;
if (!globalRef.cinebookDatabase) {
  const explicitMock = process.env.NEXT_PUBLIC_APP_ENV === 'development';
  
  if (!isSupabaseConfigured && !explicitMock) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_APP_ENV=development to use the mock database, or configure Supabase env vars.');
  }

  if (explicitMock) {
    globalRef.cinebookDatabase = new MockDatabase();
  } else {
    globalRef.cinebookDatabase = new SupabaseDatabaseClient();
  }
}

export const db: DatabaseClient = globalRef.cinebookDatabase;
export const isMockMode = process.env.NEXT_PUBLIC_APP_ENV === 'development';
export type { Movie as MovieType, Show as ShowType, SeatStatus as SeatStatusType, Booking as BookingType, Profile as ProfileType };
export * from './types';
