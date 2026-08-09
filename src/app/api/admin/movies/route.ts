import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

async function isAdmin(req: NextRequest): Promise<boolean> {
  try {
    let userRole = 'user';
    const isSupabaseConfigured = 
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
      (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isSupabaseConfigured) {
      const mockSession = req.cookies.get('cinebook_mock_session');
      if (mockSession) {
        const sessionObj = JSON.parse(mockSession.value);
        userRole = sessionObj.role;
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
        // Fallback to checking cookie if no header
        const activeSession = req.cookies.get('sb-active-session');
        if (activeSession) {
          // If we have our auth cookie, we should retrieve the user using service role or token
          // Standard getUser from next request works if auth cookie is present
          userRes = await supabase.auth.getUser();
        } else {
          userRes = await supabase.auth.getUser();
        }
      }

      if (userRes.data.user) {
        const profile = await db.getProfile(userRes.data.user.id);
        userRole = profile?.role || 'user';
      }
    }

    return userRole === 'admin';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const movies = await db.getMovies();
    return NextResponse.json({ movies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const body = await req.json();
    const { title, synopsis, genre, language, duration_minutes, certification, poster_url, trailer_url, is_featured } = body;

    if (!title) {
      return NextResponse.json({ error: 'Movie title is required' }, { status: 400 });
    }

    const newMovie = await db.createMovie({
      title,
      synopsis: synopsis || '',
      genre: genre || '',
      language: language || 'Hindi',
      duration_minutes: Number(duration_minutes) || 120,
      certification: certification || 'UA',
      poster_url: poster_url || '',
      trailer_url: trailer_url || '',
      is_featured: !!is_featured,
      is_active: true
    });

    return NextResponse.json({ success: true, movie: newMovie });
  } catch (err: any) {
    console.error('Create movie error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create movie' }, { status: 500 });
  }
}
