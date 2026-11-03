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
import AdminBookings from '@/features/admin/components/AdminBookings';
import { useAdminStore } from '@/features/admin/store/adminStore';
import { useToast } from '@/features/shared/context/ToastContext';

type TabType = 'overview' | 'bookings' | 'showtimes' | 'movies' | 'staff' | 'audit';

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

  const [statsRes, locksRes, logsRes, showsRes, moviesRes, screensRes, membersRes] = await Promise.all([
    fetch('/api/admin/stats', { headers: authHdrs }),
    fetch('/api/admin/active-locks', { headers: authHdrs }),
    fetch('/api/admin/audit-logs', { headers: authHdrs }),
    fetch('/api/shows'),
    fetch('/api/admin/movies', { headers: authHdrs }),
    fetch('/api/screens'),
    fetch('/api/admin/members', { headers: authHdrs })
  ]);

  const [statsData, locksData, logsData, showsData, moviesData, screensData, membersData] = await Promise.all([
    statsRes.ok ? statsRes.json().catch(() => ({})) : ({} as { stats?: any }),
    locksRes.json().catch(() => ({})),
    logsRes.json().catch(() => ({})),
    showsRes.json().catch(() => ({})),
    moviesRes.ok ? moviesRes.json().catch(() => ({})) : { movies: [] },
    screensRes.ok ? screensRes.json().catch(() => ({})) : { screens: [] },
    membersRes.ok ? membersRes.json().catch(() => ({})) : { members: [] }
  ]);

  return {
    stats: statsData.stats || null,
    activeLocks: locksData.activeLocks || [],
    auditLogs: logsData.logs || [],
    shows: showsData.shows || [],
    moviesList: moviesData.movies || [],
    screensList: screensData.screens || [],
    membersList: membersData.members || []
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, sessionCheckFailed, retrySessionCheck } = useCineBookAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // React Query for dashboard data
  const { data, isLoading: loading, isError: dashboardFailed } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: fetchDashboardData,
    enabled: !!user && user.role === 'admin',
    // Revenue and holds don't need second-by-second updates
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const activeLocks = data?.activeLocks || [];
  const auditLogs = data?.auditLogs || [];
  const shows = data?.shows || [];
  const moviesList = data?.moviesList || [];
  const screensList = data?.screensList || [];
  const membersList = data?.membersList || [];

  // Wait for auth to finish loading, mark as initialized, THEN redirect if not admin.
  useEffect(() => {
    // A failed check isn't a refusal: the admin gets a retry below, not the login page
    if (authLoading || sessionCheckFailed) return;
    setInitialized(true);
    if (!user) router.replace('/login?redirect=/admin/dashboard');
    else if (user.role !== 'admin') router.replace('/login?error=unauthorized');
  }, [user, authLoading, sessionCheckFailed, router]);

  // When switching tabs, close any open creation form
  const closeForm = () => {
    setIsFormOpen(false);
    // Leaving an edit behind would make the next "Add New Movie" change that film
    if (useAdminStore.getState().editingMovieId) useAdminStore.getState().resetMovieForm();
  };

  const handleTabSwitch = (tab: TabType) => {
    setActiveTab(tab);
    closeForm();
  };

  const handleToggleForm = () => {
    if (isFormOpen) closeForm();
    else setIsFormOpen(true);
  };

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
          seatLayoutIds: [seatLayoutId],
          force: true
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

  // Totals are counted from bookings in the database (all time)
  const stats = data?.stats ?? null;

  if (sessionCheckFailed && !user) {
    return (
      <>
        <Header />
        <div className="force-dark" style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', padding: '16px' }}>
          <div role="alert" style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '8px' }}>We couldn&apos;t check your sign-in</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '14px' }}>This is a connection problem. Check your internet and try again.</p>
            <button type="button" className="btn btn-primary" onClick={retrySessionCheck}>Try again</button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!initialized || loading || authLoading || !user || user.role !== 'admin') {
    return (
      <>
        <Header />
        <div className="force-dark" style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: '#FFFFFF' }}>
          <h3>Loading administrative dashboard telemetry...</h3>
        </div>
        <Footer />
      </>
    );
  }

  const TABS = [
    { id: 'overview', label: '📊 Overview', badge: null },
    { id: 'bookings', label: '🎟️ Bookings', badge: null },
    { id: 'showtimes', label: '⏰ Showtimes', badge: shows.length },
    { id: 'movies', label: '🎬 Movie Catalog', badge: moviesList.length },
    { id: 'staff', label: '👥 Counter Staff', badge: membersList.length },
    { id: 'audit', label: '📜 Security & Audit', badge: null },
  ];

  return (
    <>
      <Header />
      {/* Always the dark palette: these screens hard-code light text on dark panels */}
      <main className="force-dark" style={{ backgroundColor: 'var(--bg-primary)', color: '#FFFFFF', minHeight: 'calc(100vh - 180px)', padding: '36px 20px' }}>
        <div className="container">
          
          {/* TITLE HEADER BAR */}
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '2.1rem', fontWeight: 800, marginBottom: '6px', fontFamily: 'var(--font-family-heading)', color: '#FFFFFF' }}>
              Admin Control Center
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
              Theater management for show scheduling, movie listings, staff onboarding & telemetry.
            </p>
          </div>

          {/* TELEMETRY STAT CARDS */}
          {dashboardFailed && !data && (
            <div className="notice notice-danger" role="alert" style={{ marginBottom: '20px' }}>
              <div>Couldn&apos;t reach the server, so the figures below aren&apos;t up to date. It keeps trying by itself.</div>
            </div>
          )}

          <AdminStats stats={stats} activeLocksCount={activeLocks.length} />

          {/* SEGMENTED TAB NAVIGATION BAR */}
          <div 
            className="scrollbar-none"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '12px',
              marginBottom: '28px',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabSwitch(tab.id as TabType)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isActive ? 'var(--highlight-gold)' : 'rgba(255, 255, 255, 0.04)',
                    color: isActive ? '#08080F' : 'var(--text-secondary)',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== null && (
                    <span style={{
                      backgroundColor: isActive ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                      color: isActive ? '#08080F' : 'var(--text-secondary)',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* CREATION FORM CARD (ONLY WHEN TOGGLED OPEN INSIDE SPECIFIC TAB) */}
          <AdminForms 
            moviesList={moviesList} 
            screensList={screensList} 
            activeTab={activeTab}
            isFormOpen={isFormOpen}
            onCloseForm={closeForm}
          />

          {activeTab === 'bookings' && <AdminBookings />}

          {/* TAB CONTENT & DATA TABLES */}
          <AdminTables 
            activeLocks={activeLocks} 
            shows={shows} 
            auditLogs={auditLogs} 
            membersList={membersList}
            moviesList={moviesList}
            activeTab={activeTab}
            isFormOpen={isFormOpen}
            onToggleForm={handleToggleForm}
            onOpenForm={() => setIsFormOpen(true)}
            actioning={actioning} 
            handleForceReleaseHold={handleForceReleaseHold} 
          />

        </div>
      </main>
      <Footer />
    </>
  );
}
