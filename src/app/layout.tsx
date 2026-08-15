import type { Metadata, Viewport } from "next";
import "./globals.css";
import ErrorBoundary from "@/features/shared/components/ErrorBoundary";
import { ToastProvider } from "@/features/shared/context/ToastContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import MockAuthSwitcher from "@/features/auth/components/MockAuthSwitcher";
import { QueryProvider } from "@/features/shared/components/QueryProvider";
import { Cinzel, Inter, Outfit, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "@/features/shared/components/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";

const cinzel = Cinzel({ 
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-cinzel",
  display: "swap",
});

const inter = Inter({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#05060A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://dhrubcineplex.in"),
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
    url: "https://dhrubcineplex.in",
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
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "MovieTheater",
              "name": "Dhrub Cineplex",
              "alternateName": "Dhruv Cineplex",
              "url": "https://dhrubcineplex.in",
              "logo": "https://dhrubcineplex.in/logo.jpeg",
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
      <body className={`antialiased min-h-screen bg-void text-primary selection:bg-gold-500/30 selection:text-gold-200 ${cinzel.variable} ${inter.variable} ${outfit.variable} ${playfair.variable}`}>
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
