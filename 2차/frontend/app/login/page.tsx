'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      window.location.href = '/';
    }
  }, [user, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      window.location.href = '/';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div
        className="bg-white rounded-2xl w-full max-w-sm mx-4 p-8"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)' }}
      >
        {/* 로고 */}
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
              boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
            }}
          >
            M
          </div>
          <span
            className="font-bold text-xl tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 50%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            MSP Archive
          </span>
        </div>

        <h1 className="text-lg font-bold text-slate-800 mb-1">로그인</h1>
        <p className="text-sm text-slate-500 mb-6">계정 정보를 입력하세요.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@itcen.com"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
            }}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          계정이 없으면 관리자에게 문의하세요.
        </p>
      </div>
    </div>
  );
}
