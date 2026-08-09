'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useQuery } from '@tanstack/react-query';

export default function CounterPOSPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useCineBookAuth();
  const { showToast } = useToast();

  const { data: showsData, isLoading: loadingShows, error } = useQuery({
    queryKey: ['counterShows'],
    queryFn: async () => {
      const res = await fetch('/api/shows');
      if (!res.ok) throw new Error('Failed to load shows');
      const data = await res.json();
      return data.shows || [];
    },
    enabled: !!user && ['admin', 'member'].includes(user.role),
  });

  const shows = showsData || [];

  // Verification State
  const [tokenInput, setTokenInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedTicket, setVerifiedTicket] = useState<any | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Redirect non-staff/non-admins client-side
  useEffect(() => {
    if (!authLoading && (!user || !['admin', 'member'].includes(user.role))) {
      router.replace('/login?error=unauthorized');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (error) {
      showToast('Error loading active shows list for ticket sales.', 'error');
    }
  }, [error, showToast]);

  // Handle Ticket Scan Verification
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      showToast('Please enter a ticket validation token.', 'info');
      return;
    }

    setVerifying(true);
    setVerifiedTicket(null);
    setVerificationError(null);

    try {
      const res = await fetch(`/api/bookings/verify?token=${encodeURIComponent(tokenInput.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setVerificationError(data.error || 'Failed to verify ticket stub.');
        showToast(data.error || 'Ticket verification failed.', 'error');
      } else {
        setVerifiedTicket(data.booking);
        showToast('Ticket stub verified! Entry approved.', 'success');
      }
    } catch (err) {
      console.error(err);
      setVerificationError('Network error checking ticket validity.');
    } finally {
      setVerifying(false);
    }
  };

  const handleClearVerification = () => {
    setTokenInput('');
    setVerifiedTicket(null);
    setVerificationError(null);
  };

  // Helper date/time formatters
  const formatTimeLabel = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (authLoading || !user || !['admin', 'member'].includes(user.role)) {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: '#FFFFFF' }}>
          <h3>Loading counter POS terminal...</h3>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: 'calc(100vh - 180px)', padding: '40px 20px' }}>
        <div className="container">
          
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', fontFamily: 'var(--font-family-heading)' }}>
            Counter POS Terminal
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '40px' }}>
            Staff portal for theater entry ticket verification and quick box office cash bookings.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '40px',
            alignItems: 'start'
          }}>
            
            {/* COLUMN 1: TICKET SCANNER & VERIFICATION */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
                🎫 Scan Entry Pass
              </h3>

              <form onSubmit={handleVerifySubmit} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter Ticket Token (e.g. tkt_xxxx)"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={verifying}
                  style={{ margin: 0 }}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={verifying}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {verifying ? 'Verifying...' : 'Verify'}
                </button>
              </form>

              {/* Verified Success Results Card */}
              {verifiedTicket && (
                <div style={{
                  padding: '24px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#FFFFFF'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#10B981', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>✓</div>
                    <strong style={{ color: '#10B981', fontSize: '1.1rem' }}>VALID TICKET</strong>
                  </div>

                  <h4 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '12px' }}>
                    {verifiedTicket.show?.movie?.title}
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <p>🏛️ <strong>Screen:</strong> {verifiedTicket.show?.screen?.name}</p>
                    <p>🕒 <strong>Showtime:</strong> {formatDateLabel(verifiedTicket.show?.show_date)} at {formatTimeLabel(verifiedTicket.show?.show_time)}</p>
                    <p>🎟️ <strong>Seats:</strong> <span style={{ color: 'var(--accent-crimson)', fontWeight: 'bold' }}>{verifiedTicket.booking_seats?.map((bs: any) => `${bs.seat_layout?.row_label}-${bs.seat_layout?.seat_number}`).join(', ')}</span></p>
                    <p>👤 <strong>Holder:</strong> {verifiedTicket.customer_name} ({verifiedTicket.customer_phone})</p>
                    <p>💳 <strong>Channel:</strong> {verifiedTicket.booking_channel.toUpperCase()} (₹{verifiedTicket.total_amount})</p>
                  </div>

                  <button 
                    onClick={handleClearVerification}
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '20px', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                  >
                    Reset Scanner
                  </button>
                </div>
              )}

              {/* Verification Error Card */}
              {verificationError && (
                <div style={{
                  padding: '24px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FFFFFF'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>✕</div>
                    <strong style={{ color: '#EF4444', fontSize: '1.1rem' }}>VERIFICATION FAILED</strong>
                  </div>
                  
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    {verificationError}
                  </p>

                  <button 
                    onClick={handleClearVerification}
                    className="btn btn-secondary"
                    style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>

            {/* COLUMN 2: ACTIVE SHOWS LIST FOR DIRECT SALES */}
            <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', fontFamily: 'var(--font-family-heading)' }}>
                🏛️ Box Office Cash Tickets
              </h3>

              {loadingShows ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading active showtimes...</p>
              ) : shows.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No showtimes currently scheduled.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {shows.map((show: any) => (
                    <div 
                      key={show.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '16px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.95rem', color: '#FFFFFF', display: 'block' }}>
                          {show.movie?.title}
                        </strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {show.screen?.name} • {formatDateLabel(show.show_date)} at {formatTimeLabel(show.show_time)}
                        </span>
                      </div>

                      <Link 
                        href={`/booking/${show.id}`}
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                      >
                        Book
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
