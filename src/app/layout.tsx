import type { Metadata } from "next";
import "./globals.css";
import ErrorBoundary from "@/features/shared/components/ErrorBoundary";
import { ToastProvider } from "@/features/shared/context/ToastContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import MockAuthSwitcher from "@/features/auth/components/MockAuthSwitcher";

export const metadata: Metadata = {
  title: "Dhrub Cineplex - Premium Movie Ticket Booking",
  description: "Book tickets for your favorite movies at Dhrub Cineplex (Dhrub Talkies), Bagaha. Experience premium seating, instant confirmations, and secure online bookings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ToastProvider>
            <AuthProvider>
              {children}
              <MockAuthSwitcher />
            </AuthProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
