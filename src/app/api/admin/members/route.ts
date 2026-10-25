import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { z } from 'zod';

// Staff accounts can sell tickets and see bookings: require a real password
const memberSchema = z.object({
  full_name: z.string({ error: 'Full Name, Email, and Password are required.' }).trim().min(1, 'Full Name, Email, and Password are required.').max(100),
  email: z.string({ error: 'Full Name, Email, and Password are required.' }).trim().email('Enter a valid email address.').max(255),
  phone: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number.').optional(),
  password: z.string({ error: 'Full Name, Email, and Password are required.' }).min(10, 'Staff passwords must be at least 10 characters long.').max(72),
});
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

// Member management needs the Auth admin API, which only the service role key
// can call. No silent fallback to the anon key: that just hides a missing
// env var behind confusing permission errors.
function getServiceRoleClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function misconfiguredResponse() {
  console.error('[admin/members] SUPABASE_SERVICE_ROLE_KEY is not set — member management is unavailable.');
  return NextResponse.json(
    { error: 'Member management is not configured on the server. Please contact support.' },
    { status: 500 }
  );
}

// auth.admin.listUsers() is paginated (50 per page by default), so a single
// call silently misses everyone past the first page. Walk the pages until
// `visit` returns true, capped so a huge user table can't turn one admin
// request into an unbounded number of Auth API calls.
const LIST_USERS_PER_PAGE = 1000;
const LIST_USERS_MAX_PAGES = 20;

async function scanAuthUsers(admin: SupabaseClient, visit: (user: User) => boolean): Promise<void> {
  let page: number | null = 1;
  for (let i = 0; page && i < LIST_USERS_MAX_PAGES; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE });
    if (error) throw error;
    for (const user of data.users) {
      if (visit(user)) return;
    }
    page = data.users.length > 0 ? data.nextPage : null;
  }
  if (page) {
    console.warn(`[admin/members] Stopped scanning auth users after ${LIST_USERS_MAX_PAGES * LIST_USERS_PER_PAGE} users.`);
  }
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  let found: User | null = null;
  await scanAuthUsers(admin, (user) => {
    if (user.email?.toLowerCase() === email) found = user;
    return found !== null;
  });
  return found;
}

async function getAdminUser(req: NextRequest): Promise<{ isAdmin: boolean; userId: string | null }> {
  try {
    const user = await getRequestUser(req);
    return { isAdmin: user?.role === 'admin', userId: user?.id ?? null };
  } catch {
    return { isAdmin: false, userId: null };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { isAdmin } = await getAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required.' }, { status: 403 });
    }

    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (isSupabaseConfigured) {
      const supabaseAdmin = getServiceRoleClient();
      if (!supabaseAdmin) return misconfiguredResponse();

      const { data: memberProfiles, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('role', 'member')
        .order('created_at', { ascending: false });

      if (profileErr) throw profileErr;

      // Only hit the Auth API for profiles that don't carry their own email.
      const missingEmail = new Set((memberProfiles || []).filter(p => !p.email).map(p => p.id as string));
      const usersMap = new Map<string, string>();
      if (missingEmail.size > 0) {
        try {
          await scanAuthUsers(supabaseAdmin, (u) => {
            if (u.email && missingEmail.has(u.id)) usersMap.set(u.id, u.email);
            return usersMap.size === missingEmail.size;
          });
        } catch (e) {
          console.warn('Could not list auth users for email enrichment:', e);
        }
      }

      const members = (memberProfiles || []).map(p => ({
        ...p,
        email: p.email || usersMap.get(p.id) || ''
      }));

      return NextResponse.json({ members });
    }

    const members = await db.getMembers();
    return NextResponse.json({ members });
  } catch (err: any) {
    console.error('Fetch members error:', err);
    return NextResponse.json({ error: 'Failed to fetch members. Please try again.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { isAdmin, userId } = await getAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Only admins can onboard new members.' }, { status: 403 });
    }

    const parsed = memberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid member details.' }, { status: 400 });
    }
    const { full_name, email, phone, password } = parsed.data;

    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    let newMember;
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = full_name.trim();
    const cleanPhone = phone?.trim() || '';

    if (!isSupabaseConfigured) {
      // Mock mode onboarding
      newMember = await db.onboardMember(cleanEmail, cleanName, cleanPhone);
    } else {
      // Supabase mode onboarding
      const supabaseAdmin = getServiceRoleClient();
      if (!supabaseAdmin) return misconfiguredResponse();

      let createdUserId: string | null = null;

      // 1. Create or find auth user in Supabase
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: cleanName, phone: cleanPhone }
      });

      if (authErr) {
        // GoTrue says "A user with this email address has already been registered"
        // (code email_exists) — match the code, with the wording as a fallback.
        const alreadyExists =
          authErr.code === 'email_exists' ||
          authErr.code === 'user_already_exists' ||
          /already (been )?registered/i.test(authErr.message);

        if (alreadyExists) {
          // Promote the existing account to member (its password is unchanged).
          const existingUser = await findAuthUserByEmail(supabaseAdmin, cleanEmail);
          if (existingUser) {
            createdUserId = existingUser.id;
          } else {
            return NextResponse.json({ error: 'User is already registered.' }, { status: 400 });
          }
        } else if (authErr.status && authErr.status < 500) {
          // Validation problems (weak password, bad email…) are safe to show.
          return NextResponse.json({ error: authErr.message }, { status: 400 });
        } else {
          throw authErr;
        }
      } else {
        createdUserId = authUser?.user?.id || null;
      }

      if (createdUserId) {
        // 2. Set profile role to 'member'
        const basePayload: any = {
          id: createdUserId,
          full_name: cleanName,
          phone: cleanPhone,
          role: 'member',
          updated_at: new Date().toISOString()
        };

        let profile: any = null;
        const { data: pWithEmail, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .upsert({ ...basePayload, email: cleanEmail })
          .select()
          .single();

        if (profileErr) {
          if (profileErr.message?.includes('email')) {
            // Fallback without email column if profiles table schema cache does not have email column
            const resNoEmail = await supabaseAdmin
              .from('profiles')
              .upsert(basePayload)
              .select()
              .single();

            if (resNoEmail.error) throw resNoEmail.error;
            profile = { ...resNoEmail.data, email: cleanEmail };
          } else {
            throw profileErr;
          }
        } else {
          profile = pWithEmail;
        }

        newMember = profile ? { ...profile, email: profile.email || cleanEmail } : null;
      } else {
        newMember = await db.onboardMember(cleanEmail, cleanName, cleanPhone);
      }
    }

    // Log administrative audit entry
    await db.logAudit(
      userId,
      'MEMBER_ONBOARDED',
      {
        member_email: cleanEmail,
        member_name: cleanName,
        role: 'member',
        onboarded_by: userId || 'admin'
      },
      req.headers.get('x-forwarded-for') || '127.0.0.1'
    );

    return NextResponse.json({ success: true, member: newMember });
  } catch (err: any) {
    console.error('Member onboarding error:', err);
    return NextResponse.json({ error: 'Failed to onboard member. Please try again.' }, { status: 500 });
  }
}
