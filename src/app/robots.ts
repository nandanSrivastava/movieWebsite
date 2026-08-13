import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/account/', '/booking/checkout', '/booking/confirmation'],
    },
    sitemap: 'https://dhrubcineplex.in/sitemap.xml',
  };
}
