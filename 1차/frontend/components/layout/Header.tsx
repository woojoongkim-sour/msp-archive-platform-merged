'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, User as UserIcon, Shield, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import MailConfigModal from '@/components/MailConfigModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [customers, setCustomers] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('전체');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mailConfigOpen, setMailConfigOpen] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/v1/documents/customers')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCustomers(data); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setCustomerOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <>
    <header
      className="h-14 bg-white flex items-center justify-between px-6 border-b border-slate-300 shrink-0"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.06)' }}
    >
      {/* 로고 */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
            boxShadow: '0 2px 8px rgba(14,165,233,0.35), 0 0 0 1px rgba(14,165,233,0.15)',
          }}
        >
          M
        </div>
        <span
          className="font-bold text-lg tracking-tight"
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

      <div className="flex items-center gap-2">
        {/* 고객사 드롭다운 */}
        <div className="relative" ref={customerRef}>
          <button
            onClick={() => setCustomerOpen(v => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:border-sky-300 hover:text-sky-600 transition-all flex items-center gap-2"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minWidth: '120px' }}
          >
            <span className="truncate">
              {selectedCustomer === '전체' ? '고객사: 전체' : selectedCustomer}
            </span>
            <ChevronDown
              size={13}
              className={`shrink-0 text-slate-500 transition-transform ${customerOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {customerOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-300 rounded-xl overflow-hidden z-50"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)' }}
            >
              {['전체', ...customers].map(c => (
                <button
                  key={c}
                  onClick={() => { setSelectedCustomer(c); setCustomerOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedCustomer === c
                      ? 'bg-sky-100 text-sky-700 font-semibold'
                      : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {c}
                </button>
              ))}
              {customers.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-500">고객사 없음</p>
              )}
            </div>
          )}
        </div>

        {/* 사용자 드롭다운 */}
        {user && (
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:border-sky-300 hover:text-sky-600 transition-all flex items-center gap-2"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              {user.role === 'admin' ? (
                <Shield size={13} className="text-sky-500 shrink-0" />
              ) : (
                <UserIcon size={13} className="text-slate-500 shrink-0" />
              )}
              <span className="truncate max-w-[120px]">{user.email.split('@')[0]}</span>
              {user.role === 'admin' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold shrink-0">
                  ADMIN
                </span>
              )}
              <ChevronDown
                size={13}
                className={`shrink-0 text-slate-500 transition-transform ${userOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {userOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-300 rounded-xl overflow-hidden z-50"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)' }}
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-800 truncate">{user.email}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {user.role === 'admin' ? '관리자' : '일반 사용자'}
                  </p>
                </div>
                <button
                  onClick={() => { setUserOpen(false); setMailConfigOpen(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Mail size={13} />
                  메일 계정 설정
                </button>
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <LogOut size={13} />
                  로그아웃
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
    {mailConfigOpen && <MailConfigModal onClose={() => setMailConfigOpen(false)} />}
  </>
  );
}
