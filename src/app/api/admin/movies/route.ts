import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestUser } from '@/lib/requestAuth';
import { z } from 'zod';

const movieSchema = z.object({
  title: z.string({ error: 'Movie title is required' }).trim().min(1, 'Movie title is required').max(200),
  synopsis: z.string().trim().max(5000).optional(),
  genre: z.string().trim().max(100).optional(),
  language: z.string().trim().max(60).optional(),
  duration_minutes: z.coerce.number().int().min(1).max(600).optional(),
  certification: z.string().trim().max(10).optional(),
  poster_url: z.string().trim().max(2000).optional(),
  trailer_url: z.string().trim().max(2000).optional(),
  is_featured: z.boolean().optional(),
});

async function isAdmin(req: NextRequest): Promise<boolean> {
  try {
    return (await getRequestUser(req))?.role === 'admin';
  } catch {
    return false;
  }
}

// Posters render in <img>, trailers in an <iframe>: only plain https links
const optionalHttpsUrl = (value: unknown) => {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const movies = await db.getMovies();
    return NextResponse.json({ movies });
  } catch (err) {
    console.error('Fetch movies error:', err);
    return NextResponse.json({ error: 'Could not load movies' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const parsed = movieSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid movie details' }, { status: 400 });
    }
    const { title, synopsis, genre, language, duration_minutes, certification, poster_url, trailer_url, is_featured } = parsed.data;

    const posterUrl = optionalHttpsUrl(poster_url);
    const trailerUrl = optionalHttpsUrl(trailer_url);
    if (posterUrl === null || trailerUrl === null) {
      return NextResponse.json({ error: 'Poster and trailer links must be https:// URLs' }, { status: 400 });
    }

    const newMovie = await db.createMovie({
      title,
      synopsis: synopsis || '',
      genre: genre || '',
      language: language || 'Hindi',
      duration_minutes: duration_minutes ?? 120,
      certification: certification || 'UA',
      poster_url: posterUrl,
      trailer_url: trailerUrl,
      is_featured: !!is_featured,
      is_active: true
    });

    return NextResponse.json({ success: true, movie: newMovie });
  } catch (err) {
    console.error('Create movie error:', err);
    return NextResponse.json({ error: 'Failed to create movie' }, { status: 500 });
  }
}
