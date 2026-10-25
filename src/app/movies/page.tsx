import React from 'react';
import { db } from '@/lib/db';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import MovieBrowser from '@/features/movies/components/MovieBrowser';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

export const revalidate = 60;

export const metadata = {
  title: 'Movies',
  description: 'Films showing at Dhrub Cineplex, Bagaha. Pick a film, then a showtime and your seats.',
};

export default async function MoviesPage() {
  let movies: Awaited<ReturnType<typeof db.getMovies>>;
  try {
    movies = await db.getMovies();
  } catch (err) {
    // At request time, let it throw: ISR keeps serving the last good page
    // (error.tsx covers the rest) instead of caching an empty catalog.
    // Only during `next build` fall back to [] so a DB hiccup can't fail the
    // deploy — that page is replaced on the first revalidation.
    if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err;
    console.error('[MoviesPage] Failed to load movies at build time, rendering empty until revalidation:', err);
    movies = [];
  }

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <h1 className="display" style={{ fontSize: 'clamp(2.25rem, 7vw, 3.75rem)', marginBottom: 16 }}>Movies</h1>
        <MovieBrowser movies={movies} />
      </main>
      <Footer />
    </>
  );
}
