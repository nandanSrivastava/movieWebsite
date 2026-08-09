import type { Metadata, Viewport } from "next";
import "./globals.css";
import ErrorBoundary from "@/features/shared/components/ErrorBoundary";
import { ToastProvider } from "@/features/shared/context/ToastContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import MockAuthSwitcher from "@/features/auth/components/MockAuthSwitcher";
import { QueryProvider } from "@/features/shared/components/QueryProvider";

export const viewport: Viewport = {
  themeColor: "#05060A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://dhrubcineplex.com"),
  title: {
    default: "Dhrub Cineplex | Premium Movie Experience in Bagaha",
    template: "%s | Dhrub Cineplex",
  },
  description: "Experience the magic of cinema at Dhrub Cineplex, Bagaha's premier luxury theater. Book tickets online for the latest blockbusters with premium recliners and Dolby Atmos sound.",
  keywords: ["movie tickets", "Bagaha cinema", "Dhrub Talkies", "Dhrub Cineplex", "book movies", "luxury cinema"],
  authors: [{ name: "Dhrub Cineplex" }],
  creator: "Dhrub Cineplex",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://dhrubcineplex.com",
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
    <html lang="en" className="dark scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen bg-void text-primary selection:bg-gold-500/30 selection:text-gold-200">
        <ErrorBoundary>
          <QueryProvider>
            <ToastProvider>
              <AuthProvider>
                {children}
                <MockAuthSwitcher />
              </AuthProvider>
            </ToastProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
