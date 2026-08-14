'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';

interface LookupBooking {
  id: string;
  movieTitle: string;
  screenName: string;
  showDate: string;
  showTime: string;
  customerName: string;
  totalAmount: number;
  bookingChannel: string;
  createdAt: string;
}

export default function BookingLookupPage() {
  const { showToast } = useToast();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<LookupBooking[] | null>(null);
  const [searched, setSearched] = useState(false);

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
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || trimmedPhone.length < 5) {
      showToast('Please enter a valid phone number.', 'info');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setBookings(data.bookings || []);
      if (data.bookings?.length > 0) {
        showToast(`Found ${data.bookings.length} booking(s).`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to look up bookings.', 'error');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main style={{
        backgroundColor: 'var(--bg-void)',
        color: '#FFFFFF',
        minHeight: 'calc(100vh - 180px)',
        padding: '60px 20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{
          position: 'absolute',
          top: '10%',
          right: '15%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(197, 168, 128, 0.04) 0%, transparent 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div className="container" style={{ maxWidth: '640px', position: 'relative', zIndex: 1 }}>

          {/* Back Link */}
          <Link href="/" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            color: '#9CA3AF',
            marginBottom: '24px',
            transition: 'color 0.2s ease',
            textDecoration: 'none'
          }}>
            ← Back to Home
          </Link>

          {/* Header */}
          <div style={{ marginBottom: '40px' }}>
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--highlight-gold)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              backgroundColor: 'rgba(197, 168, 128, 0.1)',
              padding: '3px 8px',
              borderRadius: '4px',
              display: 'inline-block',
              marginBottom: '12px'
            }}>
              TICKET RETRIEVAL
            </span>
            <h1 style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              fontFamily: 'var(--font-family-heading)',
              color: '#FFFFFF',
              letterSpacing: '-1px',
              margin: 0
            }}>
              Find Your Booking
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px', lineHeight: 1.6 }}>
              Enter the phone number you used during checkout to retrieve your confirmed tickets.
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleLookup} style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '40px'
          }}>
            <input
              type="tel"
              className="form-control"
              placeholder="Enter your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                color: '#FFFFFF',
                padding: '14px 16px',
                borderRadius: '10px',
                fontSize: '1rem',
                outline: 'none',
                margin: 0,
              }}
            />
            <button
              type="submit"
              className="btn btn-gold"
              disabled={loading}
              style={{
                padding: '14px 28px',
                fontSize: '0.95rem',
                borderRadius: '10px',
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}
            >
              {loading ? 'Searching...' : 'Find Tickets'}
            </button>
          </form>

          {/* Results */}
          {searched && bookings !== null && (
            <div>
              {bookings.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '16px'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎫</div>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-family-heading)',
                    marginBottom: '8px'
                  }}>
                    No Bookings Found
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    We couldn't find any confirmed bookings for this phone number. 
                    Make sure you're entering the same number used during checkout.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {bookings.length} confirmed booking{bookings.length > 1 ? 's' : ''} found
                  </p>

                  {bookings.map((booking) => {
                    const isUpcoming = (() => {
                      try {
                        const showDT = new Date(`${booking.showDate}T${booking.showTime}+05:30`);
                        return !isNaN(showDT.getTime()) && showDT.getTime() > Date.now();
                      } catch { return false; }
                    })();

                    return (
                    <Link
                      key={booking.id}
                      href={`/booking/confirmation/${booking.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div style={{
                        padding: '24px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '14px',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                      }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(197, 168, 128, 0.4)';
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3), 0 0 20px rgba(197, 168, 128, 0.05)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-subtle)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                          <div>
                            <h4 style={{
                              fontSize: '1.2rem',
                              fontWeight: 800,
                              fontFamily: 'var(--font-family-heading)',
                              color: '#FFFFFF',
                              margin: 0
                            }}>
                              {booking.movieTitle}
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                              {booking.screenName}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '1.1rem',
                            fontWeight: 800,
                            color: 'var(--highlight-gold)'
                          }}>
                            ₹{booking.totalAmount}
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          gap: '20px',
                          flexWrap: 'wrap',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)'
                        }}>
                          <span>📅 {formatDateLabel(booking.showDate)}</span>
                          <span>🕒 {formatTimeLabel(booking.showTime)}</span>
                          <span>👤 {booking.customerName}</span>
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '14px',
                          paddingTop: '14px',
                          borderTop: '1px solid rgba(255,255,255,0.05)'
                        }}>
                          {isUpcoming ? (
                            <span style={{
                              fontSize: '0.75rem',
                              color: '#10B981',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              padding: '3px 8px',
                              borderRadius: '4px'
                            }}>
                              ✓ Confirmed
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.75rem',
                              color: '#9CA3AF',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              backgroundColor: 'rgba(156, 163, 175, 0.1)',
                              padding: '3px 8px',
                              borderRadius: '4px'
                            }}>
                              ✓ Completed
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.8rem',
                            color: 'var(--highlight-gold)',
                            fontWeight: 600
                          }}>
                            View Ticket →
                          </span>
                        </div>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Help Section */}
          <div style={{
            marginTop: '48px',
            padding: '24px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px'
          }}>
            <h4 style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              fontFamily: 'var(--font-family-heading)',
              color: 'var(--highlight-gold)',
              marginBottom: '12px'
            }}>
              Need Help?
            </h4>
            <ul style={{
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              lineHeight: 2,
              paddingLeft: '18px',
              margin: 0
            }}>
              <li>Use the same phone number you entered during checkout</li>
              <li>Only confirmed (paid) bookings are shown here</li>
              <li>Your ticket includes a QR code for entry verification at the gate</li>
              <li>If you provided an email, your ticket was also sent there automatically</li>
            </ul>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
