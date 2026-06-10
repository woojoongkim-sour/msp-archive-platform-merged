'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface AuthUser {
  email: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function setTokenCookie(token: string) {
  document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=28800; SameSite=Lax`;
}

function clearTokenCookie() {
  document.cookie = 'token=; path=/; max-age=0';
}

function getTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = getTokenFromCookie();
    if (!savedToken) {
      setLoading(false);
      return;
    }
    // 토큰 유효성 확인
    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.email) {
          setToken(savedToken);
          setUser({ email: data.email, role: data.role });
        } else {
          clearTokenCookie();
        }
      })
      .catch(() => clearTokenCookie())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '로그인에 실패했습니다');
    }
    const data = await res.json();
    setTokenCookie(data.access_token);
    setToken(data.access_token);
    setUser({ email: data.user.email, role: data.user.role });
  };

  const logout = () => {
    clearTokenCookie();
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
