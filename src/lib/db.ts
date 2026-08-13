import 'server-only';
import { DatabaseClient, Movie, Show, SeatStatus, Booking, Profile } from './types';
import { MockDatabase } from './mockDb';
import { SupabaseDatabaseClient } from './supabaseDb';

// ── LAZY CLIENT SINGLETON EXPORT ───────────────────────────────
const globalRef = global as any;

function getDatabaseInstance(): DatabaseClient {
  if (!globalRef.cinebookDatabase) {
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
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
  return globalRef.cinebookDatabase;
}

export const db: DatabaseClient = new Proxy({} as DatabaseClient, {
  get(target, prop, receiver) {
    if (prop === 'isMock') {
      const isSupabaseConfigured = 
        !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
        (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      const explicitMock = process.env.NEXT_PUBLIC_APP_ENV === 'development';
      return explicitMock || !isSupabaseConfigured;
    }
    const instance = getDatabaseInstance();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

export const isMockMode = process.env.NEXT_PUBLIC_APP_ENV === 'development';
export type { Movie as MovieType, Show as ShowType, SeatStatus as SeatStatusType, Booking as BookingType, Profile as ProfileType };
export * from './types';
