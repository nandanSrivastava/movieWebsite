import { getImageProps } from 'next/image';

// Must match images.remotePatterns in next.config.ts
const OPTIMIZED_HOSTS = new Set(['upload.wikimedia.org', 'images.unsplash.com', 'image.tmdb.org', 'miro.medium.com']);
const NO_POSTER = '/poster-placeholder.svg';

/**
 * Props for a plain <img> poster that still goes through Next's image
 * optimizer (resized WebP/AVIF instead of a 100–200 KB original). Posters on
 * hosts the optimizer doesn't allow fall back to a lazy-loaded original. A film
 * saved without a poster gets a placeholder rather than a broken image.
 */
export function posterImgProps(src: string | null | undefined, alt: string, width: number, height: number, priority = false) {
  if (!src) return { src: NO_POSTER, alt, loading: 'lazy' as const, decoding: 'async' as const };
  let optimizable = src.startsWith('/');
  if (!optimizable) {
    try {
      const url = new URL(src);
      optimizable = url.protocol === 'https:' && OPTIMIZED_HOSTS.has(url.hostname);
    } catch {
      optimizable = false;
    }
  }
  if (!optimizable) {
    return { src, alt, loading: priority ? ('eager' as const) : ('lazy' as const), decoding: 'async' as const };
  }
  return getImageProps({ src, alt, width, height, quality: 75, priority }).props;
}
