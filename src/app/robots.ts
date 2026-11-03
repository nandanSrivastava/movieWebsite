import { MetadataRoute } from 'next';
import { PUBLIC_SITE_URL } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/account/', '/counter', '/booking/checkout', '/booking/confirmation'],
    },
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
