const fs = require('fs');
const content = fs.readFileSync('src/lib/db.ts', 'utf8');

// The file has clear sections marked by comments:
// // ── DATA TYPE INTERFACES ─────────────────────────────────────
// // ── DATABASE CLIENT INTERFACE ─────────────────────────────────
// // ── IN-MEMORY MOCK DATABASE IMPLEMENTATION ─────────────────────
// // ── SUPABASE CLIENT DB IMPLEMENTATION ──────────────────────────
// // ── CLIENT SINGLETON EXPORT ───────────────────────────────────

const typesIdx = content.indexOf('// ── DATA TYPE INTERFACES ─────────────────────────────────────');
const clientIfcIdx = content.indexOf('// ── DATABASE CLIENT INTERFACE ─────────────────────────────────');
const mockIdx = content.indexOf('// ── IN-MEMORY MOCK DATABASE IMPLEMENTATION ─────────────────────');
const supabaseIdx = content.indexOf('// ── SUPABASE CLIENT DB IMPLEMENTATION ──────────────────────────');
const singletonIdx = content.indexOf('// ── CLIENT SINGLETON EXPORT ───────────────────────────────────');

const typesPart = content.substring(typesIdx, clientIfcIdx);
const clientIfcPart = content.substring(clientIfcIdx, mockIdx);
const mockPart = content.substring(mockIdx, supabaseIdx);
const supabasePart = content.substring(supabaseIdx, singletonIdx);
const singletonPart = content.substring(singletonIdx);

// src/lib/types.ts
fs.writeFileSync('src/lib/types.ts', typesPart + '\n' + clientIfcPart);

// src/lib/mockDb.ts
fs.writeFileSync('src/lib/mockDb.ts', `import { Movie, Screen, SeatLayout, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient } from './types';\n\n` + mockPart);

// src/lib/supabaseDb.ts
fs.writeFileSync('src/lib/supabaseDb.ts', `import { createClient, SupabaseClient } from '@supabase/supabase-js';\nimport { Movie, Screen, SeatLayout, Show, SeatStatus, Booking, Profile, AuditLog, DatabaseClient } from './types';\n\n` + supabasePart);

// src/lib/db.ts
fs.writeFileSync('src/lib/db.ts', `import { DatabaseClient, Movie, Show, SeatStatus, Booking, Profile } from './types';
import { MockDatabase } from './mockDb';
import { SupabaseDatabaseClient } from './supabaseDb';

` + singletonPart + `
export type { Movie as MovieType, Show as ShowType, SeatStatus as SeatStatusType, Booking as BookingType, Profile as ProfileType };
export * from './types';
`);

console.log("Files split successfully.");
