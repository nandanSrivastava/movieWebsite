import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

async function getAdminUser(req: NextRequest): Promise<{ isAdmin: boolean; userId: string | null }> {
  try {
    let userRole = 'user';
    let userId: string | null = null;
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        const sessionObj = JSON.parse(mockSession.value);
        userRole = sessionObj.role;
        userId = sessionObj.id;
      }
    } else {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      
      let userRes;
      if (token) {
        userRes = await supabase.auth.getUser(token);
      } else {
        userRes = await supabase.auth.getUser();
      }

      if (userRes.data.user) {
        userId = userRes.data.user.id;
        const profile = await db.getProfile(userRes.data.user.id);
        userRole = profile?.role || 'user';
      }
    }

    return { isAdmin: userRole === 'admin', userId };
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
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { data: memberProfiles, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('role', 'member')
        .order('created_at', { ascending: false });

      if (profileErr) throw profileErr;

      const usersMap = new Map<string, string>();
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        if (authData?.users) {
          authData.users.forEach(u => {
            if (u.email) usersMap.set(u.id, u.email);
          });
        }
      } catch (e) {
        console.warn('Could not list auth users for email enrichment:', e);
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
    return NextResponse.json({ error: err.message || 'Failed to fetch members' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { isAdmin, userId } = await getAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Only admins can onboard new members.' }, { status: 403 });
    }

    const body = await req.json();
    const { full_name, email, phone, password } = body;

    if (!email || !full_name || !password) {
      return NextResponse.json({ error: 'Full Name, Email, and Password are required.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

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
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      let createdUserId: string | null = null;

      // 1. Create or find auth user in Supabase
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: cleanName, phone: cleanPhone }
      });

      if (authErr) {
        if (authErr.message.includes('already registered')) {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === cleanEmail);
          if (existingUser) {
            createdUserId = existingUser.id;
          } else {
            return NextResponse.json({ error: 'User is already registered.' }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: authErr.message }, { status: 400 });
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
    return NextResponse.json({ error: err.message || 'Failed to onboard member' }, { status: 500 });
  }
}
