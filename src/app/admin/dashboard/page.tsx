'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isMockMode } from '@/lib/config';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminForms from '@/features/admin/components/AdminForms';
import AdminStats from '@/features/admin/components/AdminStats';
import AdminTables from '@/features/admin/components/AdminTables';
import { useToast } from '@/features/shared/context/ToastContext';

const getAuthHeaders = async (customHeaders: Record<string, string> = {}) => {
  const headers: Record<string, string> = { ...customHeaders };
  if (!isMockMode) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return headers;
};

const fetchDashboardData = async () => {
  const authHdrs = await getAuthHeaders();

  const [locksRes, logsRes, showsRes, moviesRes, screensRes] = await Promise.all([
    fetch('/api/admin/active-locks', { headers: authHdrs }),
    fetch('/api/admin/audit-logs', { headers: authHdrs }),
    fetch('/api/shows'),
    fetch('/api/admin/movies', { headers: authHdrs }),
    fetch('/api/screens')
  ]);

  const [locksData, logsData, showsData, moviesData, screensData] = await Promise.all([
    locksRes.json().catch(() => ({})),
    logsRes.json().catch(() => ({})),
    showsRes.json().catch(() => ({})),
    moviesRes.ok ? moviesRes.json().catch(() => ({})) : { movies: [] },
    screensRes.ok ? screensRes.json().catch(() => ({})) : { screens: [] }
  ]);

  return {
    activeLocks: locksData.activeLocks || [],
    auditLogs: logsData.logs || [],
    shows: showsData.shows || [],
    moviesList: moviesData.movies || [],
    screensList: screensData.screens || []
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useCineBookAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [actioning, setActioning] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // React Query for dashboard data
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: fetchDashboardData,
    enabled: !!user && user.role === 'admin',
    refetchInterval: 6000,
    staleTime: 5000,
  });

  const activeLocks = data?.activeLocks || [];
  const auditLogs = data?.auditLogs || [];
  const shows = data?.shows || [];
  const moviesList = data?.moviesList || [];
  const screensList = data?.screensList || [];

  // Wait for auth to finish loading, mark as initialized, THEN redirect if not admin.
  useEffect(() => {
    if (authLoading) return;
    setInitialized(true);
    if (!user || user.role !== 'admin') {
      router.replace('/login?error=unauthorized');
    }
  }, [user, authLoading, router]);

  // Handle Manual Seat Unlock Override
  const handleForceReleaseHold = async (showId: string, seatLayoutId: string, seatLabel: string) => {
    if (!confirm(`Are you sure you want to force-release the hold on seat ${seatLabel}?`)) return;
    
    setActioning(seatLayoutId);
    try {
      const res = await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          showId,
          seatLayoutIds: [seatLayoutId]
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to release seat hold.');
      }

      showToast(`Seat hold ${seatLabel} successfully released.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error releasing lock.', 'error');
    } finally {
      setActioning(null);
    }
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

  // Calculations
  const totalPaidRevenue = auditLogs
    .filter((log: any) => log.action === 'PAYMENT_CAPTURE_SUCCESS' || log.action === 'BOOKING_CONFIRM_CASH_POS')
    .reduce((acc: number, log: any) => {
      const amt = log.details?.amount || log.details?.totalAmount || 0;
      return acc + Number(amt);
    }, 0);

  const totalTicketsSold = shows.reduce((acc: number, show: any) => acc + (show.bookedSeats || 0), 0);

  if (!initialized || loading || authLoading || !user || user.role !== 'admin') {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: '#FFFFFF' }}>
          <h3>Loading administrative dashboard telemetry...</h3>
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
            Admin Dashboard
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '32px' }}>
            Live theater audit logs, active seats locks, and ticket occupancy indicators.
          </p>

          <AdminStats 
            totalPaidRevenue={totalPaidRevenue} 
            totalTicketsSold={totalTicketsSold} 
            activeLocksCount={activeLocks.length} 
          />

          <AdminForms 
            moviesList={moviesList} 
            screensList={screensList} 
          />

          <AdminTables 
            activeLocks={activeLocks} 
            shows={shows} 
            auditLogs={auditLogs} 
            actioning={actioning} 
            handleForceReleaseHold={handleForceReleaseHold} 
          />

        </div>      </main>
      <Footer />
    </>
  );
}
