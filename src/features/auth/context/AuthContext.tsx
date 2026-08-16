'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase as supabaseClient } from '@/lib/supabaseClient';
import { isMockMode } from '@/lib/config';

// Define the unified user profile shape
export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'admin' | 'member' | 'user';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isMock: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchMockRole: (role: 'admin' | 'member' | 'user' | 'anonymous') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── COOKIE HELPERS FOR MOCK SESSION ───────────────────────────
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function setCookie(name: string, value: string, seconds: number) {
  if (typeof document === 'undefined') return;
  const date = new Date();
  date.setTime(date.getTime() + (seconds * 1000));
  const expires = "; expires=" + date.toUTCString();
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Use the module-level singleton (prevents multiple GoTrueClient instances)
  const supabase = !isMockMode ? supabaseClient : null;

  // ── LOAD USER SESSION ────────────────────────────────────────
  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      if (isMockMode) {
        const mockSession = getCookie('cinebook_mock_session');
        if (mockSession) {
          setUser(JSON.parse(mockSession));
        } else {
          setUser(null);
        }
      } else if (supabase) {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (session?.user) {
          // Fetch additional profile data (especially the role)
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileErr) throw profileErr;

          setUser({
            id: session.user.id,
            email: session.user.email || '',
            full_name: profile?.full_name || '',
            phone: profile?.phone || '',
            role: (profile?.role as AuthUser['role']) || 'user',
          });

          // Sync session to cookie so next.js middleware path checks pass
          setCookie('sb-active-session', 'true', 86400);
        } else {
          setUser(null);
          deleteCookie('sb-active-session');
        }
      }
    } catch (err) {
      console.error('Error refreshing session:', err);
      setUser(null);
      deleteCookie('sb-active-session');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    refreshSession();

    if (!isMockMode && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          refreshSession();
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [refreshSession, supabase]);

  // ── USER SIGN IN ─────────────────────────────────────────────
  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      if (isMockMode) {
        // Mock authentication login defaults
        let role: AuthUser['role'] = 'user';
        let name = 'Mock Customer';
        let phone = '+919999912345';
        let id = 'mock-user-uuid';

        // Check seeded roles
        if (email.includes('admin')) {
          role = 'admin';
          name = 'System Administrator';
          id = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e56';
        } else if (email.includes('member') || email.includes('staff')) {
          role = 'member';
          name = 'Counter Operator 1';
          id = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e57';
        } else {
          // Check if this email was onboarded as a member via API
          try {
            const mockSessionObj = { role: 'admin' };
            const res = await fetch('/api/admin/members', {
              headers: {
                'Cookie': `cinebook_mock_session=${JSON.stringify(mockSessionObj)}`
              }
            });
            if (res.ok) {
              const data = await res.json();
              const foundMember = data.members?.find((m: any) => m.email?.toLowerCase() === email.trim().toLowerCase());
              if (foundMember) {
                role = 'member';
                name = foundMember.full_name || 'Counter Operator';
                phone = foundMember.phone || phone;
                id = foundMember.id;
              }
            }
          } catch (e) {
            // fallback to default user role
          }
        }

        const newUser: AuthUser = { id, email, full_name: name, phone, role };
        setCookie('cinebook_mock_session', JSON.stringify(newUser), 86400); // 1 day
        setUser(newUser);
      } else if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // ⚠️  Do NOT call refreshSession() here.
        // onAuthStateChange fires SIGNED_IN and calls it — a second call
        // races against it and can wipe the session (causes auto-logout).
      }
    } finally {
      setLoading(false);
    }
  };

  // ── USER SIGN UP ─────────────────────────────────────────────
  const signUp = async (email: string, password: string, fullName: string, phone: string) => {
    setLoading(true);
    try {
      if (isMockMode) {
        const id = 'mock-signup-uuid-' + Math.random().toString(36).substring(2, 6);
        const newUser: AuthUser = { id, email, full_name: fullName, phone, role: 'user' };
        setCookie('cinebook_mock_session', JSON.stringify(newUser), 86400);
        setUser(newUser);
      } else if (supabase) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
            },
          },
        });
        if (error) throw error;
        // In Supabase, the public.profiles trigger handles public.profiles insertion
      }
    } finally {
      setLoading(false);
    }
  };

  // ── USER SIGN OUT ────────────────────────────────────────────
  const signOut = async () => {
    setLoading(true);
    try {
      if (isMockMode) {
        deleteCookie('cinebook_mock_session');
        setUser(null);
      } else if (supabase) {
        await supabase.auth.signOut();
        setUser(null);
        deleteCookie('sb-active-session');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── DEV MOCK ROLE SWITCHER ───────────────────────────────────
  const switchMockRole = (role: 'admin' | 'member' | 'user' | 'anonymous') => {
    if (!isMockMode) return;
    
    if (role === 'anonymous') {
      deleteCookie('cinebook_mock_session');
      setUser(null);
    } else {
      let id = 'mock-user-uuid';
      let email = 'customer@cinebook.com';
      let name = 'Mock Customer';
      let phone = '+919999912345';

      if (role === 'admin') {
        id = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e56';
        email = 'admin@cinebook.com';
        name = 'System Administrator';
        phone = '+919999999999';
      } else if (role === 'member') {
        id = 'd0e56e07-6bcf-40a2-8b8b-d784fa734e57';
        email = 'member@cinebook.com';
        name = 'Counter Operator 1';
        phone = '+918888888888';
      }

      const updatedUser: AuthUser = { id, email, full_name: name, phone, role };
      setCookie('cinebook_mock_session', JSON.stringify(updatedUser), 86400);
      setUser(updatedUser);
    }
    
    // Force route refresh to re-evaluate edge/page middleware
    window.location.reload();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isMock: isMockMode,
        signIn,
        signUp,
        signOut,
        switchMockRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useCineBookAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useCineBookAuth must be used within an AuthProvider');
  }
  return context;
}
