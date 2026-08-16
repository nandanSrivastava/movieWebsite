'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import { useToast } from '@/features/shared/context/ToastContext';
import { useCineBookAuth } from '@/features/auth/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Ticket,
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Film,
  ShieldCheck,
  RefreshCw,
  Camera,
  CameraOff,
  Sparkles
} from 'lucide-react';

export default function CounterPOSPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useCineBookAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'sales' | 'verification'>('sales');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'today' | 'tomorrow'>('all');

  // Verification State
  const [tokenInput, setTokenInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedTicket, setVerifiedTicket] = useState<any | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Camera QR Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Fetch Shows
  const { data: showsData, isLoading: loadingShows, error, refetch: refetchShows } = useQuery({
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

  // Redirect non-staff/non-admins
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

  // Clean up camera on unmount or tab switch
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().catch(console.error);
          }
        } catch (e) {
          console.error('Error cleaning camera scanner:', e);
        }
      }
    };
  }, []);

  const extractTokenFromScannedText = (scannedText: string): string => {
    try {
      const text = scannedText.trim();
      if (text.includes('token=')) {
        const url = new URL(text);
        return url.searchParams.get('token') || text;
      }
      if (text.includes('id=')) {
        const url = new URL(text);
        return url.searchParams.get('id') || text;
      }
      if (text.includes('booking/')) {
        const parts = text.split('/');
        return parts[parts.length - 1] || text;
      }
      return text;
    } catch {
      return scannedText.trim();
    }
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    // Wait 120ms to ensure React updates DOM and renders #reader-qr-view container
    await new Promise((resolve) => setTimeout(resolve, 120));

    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        try {
          html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn('Error clearing previous scanner instance:', e);
        }
        html5QrCodeRef.current = null;
      }

      const qrScanner = new Html5Qrcode('reader-qr-view');
      html5QrCodeRef.current = qrScanner;

      const qrConfig = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0,
      };

      const qrSuccessCallback = (decodedText: string) => {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([100, 50, 100]);
        }
        const token = extractTokenFromScannedText(decodedText);
        setTokenInput(token);
        stopCameraScanner();
        verifyTokenDirectly(token);
      };

      let started = false;

      // Strategy 1: Explicit Device ID resolution using Html5Qrcode.getCameras()
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          const backCam = devices.find((d) =>
            /back|rear|environment|0/i.test(d.label || '')
          ) || devices[devices.length - 1] || devices[0];

          await qrScanner.start(
            backCam.id,
            qrConfig,
            qrSuccessCallback,
            () => {}
          );
          started = true;
        }
      } catch (camListErr) {
        console.warn('Html5Qrcode.getCameras resolution failed, falling back:', camListErr);
      }

      // Strategy 2: Constraint fallback (facingMode: environment)
      if (!started) {
        try {
          await qrScanner.start(
            { facingMode: 'environment' },
            qrConfig,
            qrSuccessCallback,
            () => {}
          );
          started = true;
        } catch (envErr) {
          console.warn('facingMode environment constraint failed, falling back to user camera:', envErr);
        }
      }

      // Strategy 3: Final fallback (facingMode: user)
      if (!started) {
        await qrScanner.start(
          { facingMode: 'user' },
          qrConfig,
          qrSuccessCallback,
          () => {}
        );
      }
    } catch (err: any) {
      console.error('Camera scanner init failed:', err);
      const errStr = String(err?.message || err || '');
      const errName = err?.name || '';

      let msg = 'Failed to start camera scanner.';

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errStr.includes('Permission denied') || errStr.includes('NotAllowedError')) {
        msg = 'Camera permission was denied or dismissed. Please ensure camera access is allowed in browser and site settings.';
      } else if (errName === 'NotReadableError' || errStr.includes('NotReadableError') || errStr.includes('Could not start video source') || errStr.includes('in use')) {
        msg = 'Camera hardware is busy or in use by another app (e.g. WhatsApp, Camera app). Please close background camera apps and try again.';
      } else if (errName === 'NotFoundError' || errStr.includes('NotFoundError') || errStr.includes('Requested device not found')) {
        msg = 'No physical camera detected on this device.';
      } else if (errStr) {
        msg = `Camera initialization error: ${errStr}`;
      }

      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.error(e);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
  };

  const verifyTokenDirectly = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) return;

    setVerifying(true);
    setVerifiedTicket(null);
    setVerificationError(null);

    try {
      const res = await fetch(`/api/bookings/verify?token=${encodeURIComponent(tokenToVerify.trim())}`);
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

  const isShowInPast = (showDate: string, showTime: string) => {
    try {
      const formattedTime = showTime.length === 5 ? `${showTime}:00` : showTime;
      const showDateTime = new Date(`${showDate}T${formattedTime}+05:30`);
      return showDateTime.getTime() < Date.now();
    } catch {
      return false;
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Filter shows based on date, time, search
  const filteredShows = useMemo(() => {
    return shows.filter((show: any) => {
      if (isShowInPast(show.show_date, show.show_time)) return false;

      if (selectedDateFilter === 'today' && show.show_date !== todayStr) return false;
      if (selectedDateFilter === 'tomorrow' && show.show_date !== tomorrowStr) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = show.movie?.title?.toLowerCase().includes(query);
        const dateMatch = show.show_date?.includes(query);
        const timeMatch = show.show_time?.includes(query);
        if (!titleMatch && !dateMatch && !timeMatch) return false;
      }

      return true;
    });
  }, [shows, selectedDateFilter, searchQuery, todayStr, tomorrowStr]);

  // Group shows by movie
  const groupedByMovie = useMemo(() => {
    const map = new Map<string, { movie: any; shows: any[] }>();
    filteredShows.forEach((show: any) => {
      const movieId = show.movie_id || show.movie?.id || 'unknown';
      if (!map.has(movieId)) {
        map.set(movieId, { movie: show.movie, shows: [] });
      }
      map.get(movieId)!.shows.push(show);
    });
    return Array.from(map.values());
  }, [filteredShows]);

  // Ticket verification form handler
  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      showToast('Please enter a ticket validation token.', 'info');
      return;
    }
    verifyTokenDirectly(tokenInput);
  };

  const handleClearVerification = () => {
    setTokenInput('');
    setVerifiedTicket(null);
    setVerificationError(null);
  };

  if (authLoading || !user || !['admin', 'member'].includes(user.role)) {
    return (
      <>
        <Header />
        <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 text-white" style={{ display: 'flex', minHeight: '70vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090D16', color: '#FFFFFF' }}>
          <div className="text-center" style={{ textAlign: 'center' }}>
            <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-emerald-500" style={{ margin: '0 auto 12px', width: '28px', height: '28px', color: '#10B981' }} />
            <h3 className="text-sm font-semibold text-slate-300" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#9CA3AF' }}>Loading Box Office POS...</h3>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .pos-container {
          background-color: #090D16;
          color: #FFFFFF;
          min-height: calc(100vh - 140px);
          padding: 12px 14px 60px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .pos-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 12px;
          margin-bottom: 14px;
          gap: 8px;
        }

        .pos-segmented-bar {
          display: flex;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 3px;
          margin-bottom: 16px;
          gap: 4px;
        }

        .pos-segmented-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 12px;
          border-radius: 9px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }

        .pos-segmented-btn.active-sales {
          background: #10B981;
          color: #000000;
        }

        .pos-segmented-btn.active-scanner {
          background: #F59E0B;
          color: #000000;
        }

        .pos-segmented-btn.inactive {
          background: transparent;
          color: #9CA3AF;
        }

        .movie-card-item {
          background-color: #111726;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 14px;
          margin-bottom: 14px;
        }

        .movie-info-flex {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .movie-poster-thumb {
          width: 70px;
          height: 102px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .showtime-grid-cols {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }

        /* HTML5 QR Code Scanner Overrides */
        #reader-qr-view {
          width: 100% !important;
          border: none !important;
          border-radius: 14px !important;
          overflow: hidden !important;
        }
        #reader-qr-view video {
          border-radius: 14px !important;
          object-fit: cover !important;
        }

        @media (max-width: 500px) {
          .showtime-grid-cols {
            grid-template-columns: 1fr;
          }
          .pos-container {
            padding: 10px 8px 40px;
          }
        }
      `}} />

      <Header />
      <main className="min-h-[calc(100vh-140px)] bg-slate-950 px-3 py-3 text-white sm:px-6 sm:py-6 pos-container">
        <div className="mx-auto max-w-6xl">
          
          {/* MOBILE-FIRST HEADER BAR */}
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3 pos-header-row">
            <div>
              <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="font-heading text-lg font-extrabold text-white sm:text-2xl" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                  Box Office POS
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400" style={{ padding: '2px 7px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5" style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '2px' }}>
                Staff: <span className="font-medium text-slate-200" style={{ color: '#E5E7EB', fontWeight: 600 }}>{user.full_name || user.email}</span> • Dhrub Talkies
              </p>
            </div>

            <button
              onClick={() => refetchShows()}
              title="Refresh showtimes"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors active:scale-95"
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#D1D5DB', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" style={{ width: '14px', height: '14px', color: '#10B981' }} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>

          {/* MOBILE-FIRST NATIVE SEGMENTED TABS */}
          <div className="mb-4 flex rounded-xl border border-slate-800 bg-slate-900/60 p-1 pos-segmented-bar">
            <button
              onClick={() => {
                stopCameraScanner();
                setActiveTab('sales');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs sm:text-sm font-bold transition-all pos-segmented-btn ${
                activeTab === 'sales'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 active-sales'
                  : 'text-slate-400 hover:text-white inactive'
              }`}
            >
              <Ticket className="h-4 w-4" style={{ width: '16px', height: '16px' }} />
              <span>Issue Tickets</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                activeTab === 'sales' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`} style={{ padding: '1px 6px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, backgroundColor: activeTab === 'sales' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)' }}>
                {filteredShows.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('verification')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs sm:text-sm font-bold transition-all pos-segmented-btn ${
                activeTab === 'verification'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20 active-scanner'
                  : 'text-slate-400 hover:text-white inactive'
              }`}
            >
              <QrCode className="h-4 w-4" style={{ width: '16px', height: '16px' }} />
              <span>Gate Scanner</span>
            </button>
          </div>

          {/* TAB 1: POS TICKET SALES */}
          {activeTab === 'sales' && (
            <div className="space-y-4">
              
              {/* FILTER & SEARCH ROW */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                
                {/* Date Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                  <span className="text-xs font-semibold text-slate-400 mr-1 whitespace-nowrap" style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 600 }}>Date:</span>
                  <button
                    onClick={() => setSelectedDateFilter('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                      selectedDateFilter === 'all'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: 'none', backgroundColor: selectedDateFilter === 'all' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: selectedDateFilter === 'all' ? '#10B981' : '#9CA3AF' }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedDateFilter('today')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                      selectedDateFilter === 'today'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: 'none', backgroundColor: selectedDateFilter === 'today' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: selectedDateFilter === 'today' ? '#10B981' : '#9CA3AF' }}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedDateFilter('tomorrow')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                      selectedDateFilter === 'tomorrow'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: 'none', backgroundColor: selectedDateFilter === 'tomorrow' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: selectedDateFilter === 'tomorrow' ? '#10B981' : '#9CA3AF' }}
                  >
                    Tomorrow
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64" style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: '#6B7280' }} />
                  <input
                    type="text"
                    placeholder="Search movie title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/90 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF', fontSize: '0.82rem', outline: 'none' }}
                  />
                </div>
              </div>

              {/* MOVIE LISTING CARDS */}
              {loadingShows ? (
                <div className="py-12 text-center text-slate-400" style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
                  <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-500" style={{ margin: '0 auto 8px', width: '24px', height: '24px', color: '#10B981' }} />
                  <p className="text-xs" style={{ fontSize: '0.85rem' }}>Loading available showtimes...</p>
                </div>
              ) : groupedByMovie.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-10 px-4 text-center" style={{ padding: '30px 16px', textAlign: 'center', backgroundColor: '#111726', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Film className="mx-auto mb-2 h-8 w-8 text-slate-600" style={{ margin: '0 auto 8px', width: '32px', height: '32px', color: '#4B5563' }} />
                  <h3 className="text-sm font-bold text-white mb-1" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>No Showtimes Found</h3>
                  <p className="text-xs text-slate-400" style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: 0 }}>
                    {searchQuery ? `No showtimes matching "${searchQuery}"` : 'No active showtimes currently scheduled.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedByMovie.map(({ movie, shows: movieShows }) => (
                    <div key={movie?.id || movieShows[0]?.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4 backdrop-blur-sm movie-card-item">
                      
                      {/* Movie Header Row */}
                      <div className="flex gap-3 items-start mb-3 movie-info-flex">
                        {movie?.poster_url ? (
                          <img src={movie.poster_url} alt={movie.title} className="h-24 w-16 sm:h-28 sm:w-20 rounded-lg object-cover border border-slate-800 flex-shrink-0 shadow-md movie-poster-thumb" />
                        ) : (
                          <div className="flex h-24 w-16 sm:h-28 sm:w-20 items-center justify-center rounded-lg bg-slate-800 text-slate-500 flex-shrink-0 movie-poster-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1E28', color: '#6B7280' }}>
                            <Film className="h-6 w-6" style={{ width: '24px', height: '24px' }} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0" style={{ flex: 1, minWidth: 0 }}>
                          <h2 className="text-base sm:text-lg font-extrabold text-white truncate" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 4px 0', color: '#FFFFFF', lineHeight: 1.2 }}>
                            {movie?.title || 'Unknown Title'}
                          </h2>
                          
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.74rem', color: '#9CA3AF' }}>
                            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 font-bold text-amber-400 border border-amber-400/20" style={{ backgroundColor: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, color: '#F59E0B' }}>
                              {movie?.certification || 'UA'}
                            </span>
                            <span>• {movie?.genre || 'Action'}</span>
                            <span>• {movie?.language || 'Hindi'}</span>
                            <span>• {movie?.duration_minutes || 120} min</span>
                          </div>
                        </div>
                      </div>

                      {/* Showtimes Grid */}
                      <div>
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          Available Showtimes:
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 showtime-grid-cols">
                          {movieShows.map((show: any) => (
                            <div
                              key={show.id}
                              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 sm:p-3 hover:border-slate-700 transition-colors"
                              style={{ backgroundColor: '#090D16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                            >
                              <div className="flex items-start justify-between mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div>
                                  <div className="flex items-center gap-1 text-sm font-extrabold text-emerald-400" style={{ fontSize: '0.98rem', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock className="h-3.5 w-3.5" style={{ width: '14px', height: '14px' }} />
                                    {formatTimeLabel(show.show_time)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5" style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: '2px' }}>
                                    📅 {formatDateLabel(show.show_date)}
                                  </div>
                                </div>

                                <div className="text-right" style={{ textAlign: 'right' }}>
                                  <span className="block text-xs font-bold text-amber-400" style={{ fontSize: '0.72rem', color: '#F59E0B', fontWeight: 700, display: 'block' }}>
                                    Classic ₹{show.price_classic || show.price_economy || 150}
                                  </span>
                                  <span className="text-[10px] text-slate-400" style={{ fontSize: '0.68rem', color: '#9CA3AF' }}>
                                    Premium ₹{show.price_premium || 200}
                                  </span>
                                </div>
                              </div>

                              <Link
                                href={`/booking/${show.id}`}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400 active:scale-[0.98] transition-all shadow-sm"
                                style={{ width: '100%', padding: '6px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '4px', borderRadius: '6px', backgroundColor: '#10B981', color: '#000000', textDecoration: 'none' }}
                              >
                                <Zap className="h-3.5 w-3.5" style={{ width: '14px', height: '14px' }} />
                                <span>Book Seats</span>
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: GATE ENTRY CAMERA SCANNER */}
          {activeTab === 'verification' && (
            <div className="mx-auto max-w-lg" style={{ maxWidth: '540px', margin: '0 auto' }}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 backdrop-blur-sm shadow-xl" style={{ backgroundColor: '#111726', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px' }}>
                
                <div className="mb-4 text-center" style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20" style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <QrCode className="h-6 w-6" style={{ width: '24px', height: '24px' }} />
                  </div>
                  <h2 className="font-heading text-lg font-extrabold text-white" style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 2px 0' }}>
                    Gate Ticket Scanner
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5" style={{ color: '#9CA3AF', fontSize: '0.8rem', margin: 0 }}>
                    Scan customer ticket QR code using mobile camera
                  </p>
                </div>

                {/* CAMERA SCANNER TOGGLE BUTTON */}
                <div className="mb-4 text-center">
                  {!isCameraActive ? (
                    <button
                      onClick={startCameraScanner}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 px-4 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-300 active:scale-[0.98] transition-all"
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: '#F59E0B', color: '#000000', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}
                    >
                      <Camera className="h-4 w-4" style={{ width: '18px', height: '18px' }} />
                      <span>Start Mobile Camera Scanner</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopCameraScanner}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 py-2.5 px-4 text-xs font-bold text-rose-400 hover:bg-slate-700 transition-colors"
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}
                    >
                      <CameraOff className="h-4 w-4" style={{ width: '16px', height: '16px' }} />
                      <span>Close Camera Scanner</span>
                    </button>
                  )}
                </div>

                {/* LIVE CAMERA VIEW CONTAINER */}
                <div
                  className="mb-4 rounded-xl border border-amber-400/40 bg-slate-950 p-2 overflow-hidden shadow-inner text-center"
                  style={{
                    marginBottom: '14px',
                    borderRadius: '14px',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    backgroundColor: '#000000',
                    padding: '6px',
                    display: isCameraActive ? 'block' : 'none'
                  }}
                >
                  <div id="reader-qr-view" className="w-full"></div>
                  <div className="mt-2 text-[11px] font-medium text-amber-400 flex items-center justify-center gap-1" style={{ fontSize: '0.75rem', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
                    <Sparkles className="h-3 w-3 animate-spin" style={{ width: '12px', height: '12px' }} />
                    <span>Point camera directly at customer&apos;s ticket QR code</span>
                  </div>
                </div>

                {cameraError && (
                  <div className="mb-4 rounded-xl bg-rose-950/40 border border-rose-500/30 p-3.5 text-xs text-rose-200 text-left" style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'rgba(153, 27, 27, 0.25)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#FECDD3', fontSize: '0.8rem', marginBottom: '16px' }}>
                    <div className="flex items-center gap-2 font-bold text-rose-400 mb-1.5" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F87171', fontWeight: 700, marginBottom: '6px', fontSize: '0.88rem' }}>
                      <XCircle className="h-4 w-4 flex-shrink-0" style={{ width: '18px', height: '18px', color: '#F87171' }} />
                      <span>{cameraError}</span>
                    </div>

                    <div className="mt-2.5 rounded-lg bg-slate-950/80 p-3 border border-slate-800 text-[11px] text-slate-300 space-y-2" style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', color: '#D1D5DB', marginTop: '10px' }}>
                      <div className="font-semibold text-amber-400 uppercase tracking-wider" style={{ color: '#F59E0B', fontWeight: 700, fontSize: '0.7rem', marginBottom: '4px' }}>
                        💡 How to enable camera access:
                      </div>
                      <div style={{ margin: '4px 0 6px 0', lineHeight: '1.4' }}>
                        <strong className="text-white" style={{ color: '#FFFFFF' }}>1. Android Phone System Permission (Required):</strong><br />
                        Open phone <strong>Settings ⚙️</strong> → <strong>Apps</strong> → <strong>Chrome</strong> → <strong>Permissions</strong> → <strong>Camera</strong> → Select <strong>&quot;Allow only while using the app&quot;</strong>.
                      </div>
                      <div style={{ lineHeight: '1.4' }}>
                        <strong className="text-white" style={{ color: '#FFFFFF' }}>2. Chrome Browser Site Permission:</strong><br />
                        Tap the <strong>🔒 icon</strong> next to the web address → <strong>Permissions / Site settings</strong> → <strong>Camera</strong> → Select <strong>Allow</strong>.
                      </div>
                    </div>
                  </div>
                )}

                {/* MANUAL TOKEN ENTRY FORM */}
                <form onSubmit={handleVerifySubmit} className="mb-4" style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Or Enter Ticket Token Manually:
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2" style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Enter Ticket Token (e.g. tkt_xxxx)"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      disabled={verifying}
                      className="w-full flex-1 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                      style={{ margin: 0, fontSize: '0.88rem', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.4)', flex: 1, border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                    />
                    <button
                      type="submit"
                      disabled={verifying}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 active:scale-[0.98] transition-all disabled:opacity-50"
                      style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px', backgroundColor: '#F59E0B', color: '#000000', cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    >
                      {verifying ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          Verify
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* VERIFICATION SUCCESS */}
                {verifiedTicket && (
                  <div className="rounded-xl border-2 border-emerald-500 bg-emerald-500/10 p-4 text-white animate-in fade-in duration-200" style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(16,185,129,0.08)', border: '2px solid #10B981', color: '#FFFFFF' }}>
                    <div className="mb-3 flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" style={{ color: '#10B981' }} />
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400" style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#10B981' }}>
                            ENTRY APPROVED
                          </span>
                          <h3 className="text-sm font-extrabold text-white" style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>VALID TICKET</h3>
                        </div>
                      </div>

                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30" style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: 'rgba(16,185,129,0.2)', color: '#10B981' }}>
                        {verifiedTicket.booking_channel?.toUpperCase()} POS
                      </span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-950/60 p-3 text-xs" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '0.8rem', marginBottom: '14px' }}>
                      <div>
                        <span className="text-[10px] text-slate-400 block" style={{ fontSize: '0.68rem', color: '#9CA3AF', display: 'block' }}>MOVIE</span>
                        <strong className="text-white text-xs" style={{ fontSize: '0.88rem', color: '#FFFFFF' }}>{verifiedTicket.show?.movie?.title}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block" style={{ fontSize: '0.68rem', color: '#9CA3AF', display: 'block' }}>SHOWTIME</span>
                        <strong className="text-amber-400 text-xs" style={{ color: '#F59E0B' }}>
                          {formatDateLabel(verifiedTicket.show?.show_date)} at {formatTimeLabel(verifiedTicket.show?.show_time)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block" style={{ fontSize: '0.68rem', color: '#9CA3AF', display: 'block' }}>SEATS</span>
                        <strong className="text-rose-400 text-xs" style={{ color: '#EF4444', fontSize: '0.92rem' }}>
                          {verifiedTicket.booking_seats?.map((bs: any) => `${bs.seat_layout?.row_label}-${bs.seat_layout?.seat_number}`).join(', ') || 'Confirmed'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block" style={{ fontSize: '0.68rem', color: '#9CA3AF', display: 'block' }}>PASS HOLDER</span>
                        <strong className="text-slate-200 text-xs">{verifiedTicket.customer_name || 'Visitor'} ({verifiedTicket.customer_phone || 'N/A'})</strong>
                      </div>
                    </div>

                    <button
                      onClick={handleClearVerification}
                      className="w-full rounded-lg border border-emerald-500/40 bg-slate-900/80 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
                      style={{ width: '100%', borderRadius: '6px', padding: '8px', fontSize: '0.8rem', border: '1px solid rgba(16,185,129,0.4)', backgroundColor: '#111726', color: '#FFFFFF', cursor: 'pointer' }}
                    >
                      Clear & Scan Next Ticket
                    </button>
                  </div>
                )}

                {/* VERIFICATION ERROR */}
                {verificationError && (
                  <div className="rounded-xl border-2 border-rose-500 bg-rose-500/10 p-4 text-white animate-in fade-in duration-200" style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid #EF4444', color: '#FFFFFF' }}>
                    <div className="mb-2 flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <XCircle className="h-5 w-5 text-rose-500" style={{ color: '#EF4444' }} />
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400" style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#EF4444' }}>
                          ENTRY DENIED
                        </span>
                        <h3 className="text-sm font-extrabold text-white" style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>INVALID TICKET</h3>
                      </div>
                    </div>

                    <p className="mb-3 text-xs text-slate-300" style={{ fontSize: '0.8rem', color: '#D1D5DB', marginBottom: '14px' }}>
                      {verificationError}
                    </p>

                    <button
                      onClick={handleClearVerification}
                      className="w-full rounded-lg border border-rose-500/40 bg-slate-900/80 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
                      style={{ width: '100%', borderRadius: '6px', padding: '8px', fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.4)', backgroundColor: '#111726', color: '#FFFFFF', cursor: 'pointer' }}
                    >
                      Try Again
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </>
  );
}
