import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * Refresh the cached pages a catalogue change appears on. Pages otherwise update
 * only after a visitor has already been shown the old copy, so on a quiet site a
 * new show could stay invisible to the first customer who looks for it.
 */
export function revalidateCatalogPages(movieId?: string | null) {
  try {
    revalidatePath('/');
    revalidatePath('/movies');
    if (movieId) revalidatePath(`/movies/${movieId}`);
  } catch (err) {
    console.error('Could not refresh cached pages:', err);
  }
}

export function revalidateShowPages(movieId?: string | null, showId?: string | null) {
  revalidateCatalogPages(movieId);
  try {
    if (showId) revalidatePath(`/booking/${showId}`);
  } catch (err) {
    console.error('Could not refresh the seat map page:', err);
  }
}
