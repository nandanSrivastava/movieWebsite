import type { Metadata, Viewport } from "next";
import "./globals.css";
import ErrorBoundary from "@/features/shared/components/ErrorBoundary";
import { ToastProvider } from "@/features/shared/context/ToastContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import MockAuthSwitcher from "@/features/auth/components/MockAuthSwitcher";
import { QueryProvider } from "@/features/shared/components/QueryProvider";
import { Mukta, Rozha_One } from "next/font/google";
import { ThemeProvider } from "@/features/shared/components/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";
import { PUBLIC_SITE_URL } from "@/lib/siteUrl";

// Display: Rozha One (Hindi film title-card face). Text: Mukta (by Ek Type).
// Both carry Devanagari, so Hindi labels render in the same voice. Only Latin is
// preloaded; the Devanagari files still download on a page that actually uses them.
const rozha = Rozha_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-rozha",
  display: "swap",
});

const mukta = Mukta({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mukta",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#05060A",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled (accessibility: low-vision users must be able to zoom)
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  alternates: { canonical: "./" },
  title: {
    default: "Dhrub Cineplex | Premium Movie Experience in Bagaha",
    template: "%s | Dhrub Cineplex",
  },
  description: "Experience the magic of cinema at Dhrub Cineplex (Dhruv Cineplex), Bagaha's premier luxury theater. Book tickets online for the latest blockbusters with premium recliners and Dolby Atmos sound.",
  keywords: ["movie tickets", "Bagaha cinema", "Dhrub Talkies", "Dhrub Cineplex", "Dhruv Cineplex", "Dhruv Talkies", "book movies", "luxury cinema"],
  authors: [{ name: "Dhrub Cineplex" }],
  creator: "Dhrub Cineplex",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: PUBLIC_SITE_URL,
    title: "Dhrub Cineplex | Premium Movie Experience",
    description: "Book tickets online for the latest blockbusters with premium recliners and Dolby Atmos sound.",
    siteName: "Dhrub Cineplex",
    images: [
      {
        url: "/logo.jpeg",
        width: 1200,
        height: 630,
        alt: "Dhrub Cineplex Premium Experience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dhrub Cineplex | Premium Movie Experience",
    description: "Experience the magic of cinema at Dhrub Cineplex, Bagaha's premier luxury theater.",
    images: ["/logo.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN" className={`${rozha.variable} ${mukta.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "MovieTheater",
              "name": "Dhrub Cineplex",
              "alternateName": "Dhruv Cineplex",
              "url": PUBLIC_SITE_URL,
              "logo": `${PUBLIC_SITE_URL}/logo.jpeg`,
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Bagaha",
                "addressRegion": "Bihar",
                "addressCountry": "IN"
              }
            })
          }}
        />
      </head>
      <body>
        <noscript>
          <p className="notice notice-urgent" style={{ margin: 16 }}>
            This site needs JavaScript to show seats and take payments. Please turn it on, or book at the counter: +91 99340 60014.
          </p>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ErrorBoundary>
            <QueryProvider>
              <ToastProvider>
                <AuthProvider>
                  {children}
                  <MockAuthSwitcher />
                  <Analytics />
                </AuthProvider>
              </ToastProvider>
            </QueryProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
