import { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { PUBLIC_SITE_URL } from '@/lib/siteUrl';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: PUBLIC_SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${PUBLIC_SITE_URL}/movies`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${PUBLIC_SITE_URL}/menu`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${PUBLIC_SITE_URL}/booking/lookup`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${PUBLIC_SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${PUBLIC_SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${PUBLIC_SITE_URL}/refund`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  // The film pages are what people search for, but a database blip mustn't lose the rest
  try {
    const movies = await db.getMovies();
    return [
      ...pages,
      ...movies.map(movie => ({
        url: `${PUBLIC_SITE_URL}/movies/${movie.id}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
    ];
  } catch (err) {
    console.error('Sitemap could not list movies:', err);
    return pages;
  }
}
