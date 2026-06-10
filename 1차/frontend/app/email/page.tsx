'use client';

import { apiFetch } from '@/lib/apiFetch';

import { useState, useEffect } from 'react';
import { RefreshCw, Search, Loader2 } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface EmailTag {
  email_from?: string;
  email_to?: string;
  email_date?: string;
  email_message_id?: string;
}

interface EmailItem {
  id: string;
  title: string;
  customer_id: string | null;
  processing_status: string;
  created_at: string;
  tags: EmailTag;
}

interface EmailDetail extends EmailItem {
  content: string | null;
}

export default function EmailPage() {
  const [customers, setCustomers] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EmailItem[] | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [fetchLimit, setFetchLimit] = useState(10);

  // 고객사 목록 로드
  useEffect(() => {
    apiFetch(`/api/v1/email/customers`)
      .then(res => res.json())
      .then(data => {
        // API now returns list[str] directly
        if (Array.isArray(data)) setCustomers(data);
      })
      .catch(() => {});
  }, []);

  // 이메일 목록 로드
  useEffect(() => {
    setListLoading(true);
    setSearchResults(null);
    setSelectedEmail(null);
    const path =
      customerFilter === 'all'
        ? `/api/v1/email/list`
        : `/api/v1/email/list?customer_id=${encodeURIComponent(customerFilter)}`;
    apiFetch(path)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setEmails(data);
        else setEmails([]);
      })
      .catch(() => setEmails([]))
      .finally(() => setListLoading(false));
  }, [customerFilter]);

  // 이메일 선택 → 상세 API 호출
  const handleSelectEmail = async (email: EmailItem) => {
    setDetailLoading(true);
    setSelectedEmail({ ...email, content: null });
    try {
      const res = await apiFetch(`/api/v1/email/${email.id}`);
      if (res.ok) {
        const detail: EmailDetail = await res.json();
        setSelectedEmail(detail);
      }
    } catch {}
    finally { setDetailLoading(false); }
  };

  const handleFetchEmails = async () => {
    setFetchLoading(true);
    try {
      await apiFetch(`/api/v1/email/fetch?limit=${fetchLimit}`, { method: 'POST' });
      const path =
        customerFilter === 'all'
          ? `/api/v1/email/list`
          : `/api/v1/email/list?customer_id=${encodeURIComponent(customerFilter)}`;
      const res = await apiFetch(path);
      const data = await res.json();
      if (Array.isArray(data)) setEmails(data);
    } catch {}
    finally { setFetchLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    try {
      const body: Record<string, unknown> = { query: searchQuery, filters: { doc_type: 'email' } };
      if (customerFilter !== 'all') body.customer_id = customerFilter;
      const res = await apiFetch(`/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch { setSearchResults([]); }
  };

  const displayedEmails = searchResults !== null ? searchResults : emails;

  const formatDate = (email: EmailItem) => {
    const d = email.tags?.email_date || email.created_at;
    try { return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  const inputCls = "px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-400 transition-all";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-6 py-3.5 border-b border-slate-300 bg-white shrink-0" style={{boxShadow: '0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">고객사</label>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className={inputCls}>
              <option value="all">전체</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-slate-500">최근</label>
            <input
              type="number"
              value={fetchLimit}
              onChange={e => setFetchLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className={`${inputCls} w-16 text-center`}
              min={1}
              max={500}
            />
            <label className="text-xs font-semibold text-slate-500">개</label>
          </div>
          <button
            onClick={handleFetchEmails}
            disabled={fetchLoading}
            className="flex items-center gap-2 px-4 py-1.5 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: '0 2px 8px rgba(14,165,233,0.28)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchLoading ? 'animate-spin' : ''}`} />
            이메일 가져오기
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-48">
            <input
              type="text"
              placeholder="이메일 내 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={handleSearch}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Email list */}
        <div className="w-80 shrink-0 border-r border-slate-300 bg-slate-100 overflow-y-auto">
          {listLoading && <div className="p-4 text-sm text-slate-500 animate-pulse">로딩 중...</div>}
          {!listLoading && displayedEmails.length === 0 && (
            <div className="p-6 text-sm text-slate-500 text-center leading-relaxed">
              {searchResults !== null
                ? '검색 결과가 없습니다.'
                : '이메일이 없습니다. 이메일 가져오기 버튼을 눌러보세요.'}
            </div>
          )}
          {displayedEmails.map(email => (
            <button
              key={email.id}
              onClick={() => handleSelectEmail(email)}
              className={`w-full text-left px-4 py-4 border-b border-slate-300 transition-colors ${
                selectedEmail?.id === email.id
                  ? 'bg-white border-l-2 border-l-sky-500'
                  : 'hover:bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                {email.customer_id && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-bold shrink-0">
                    {email.customer_id}
                  </span>
                )}
                <span className="text-xs text-slate-500 shrink-0 ml-auto">{formatDate(email)}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{email.title}</p>
              {email.tags?.email_from && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{email.tags.email_from}</p>
              )}
            </button>
          ))}
        </div>

        {/* Email detail */}
        <div className="flex-1 overflow-y-auto bg-white p-6">
          {!selectedEmail ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              이메일을 선택하면 내용이 표시됩니다.
            </div>
          ) : (
            <div className="max-w-3xl space-y-5 animate-fade-in">
              {/* 헤더 */}
              <div className="pb-5 border-b border-slate-300 space-y-3">
                <h2 className="text-xl font-bold text-slate-900">{selectedEmail.title}</h2>
                <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
                  <span className="text-slate-500 font-medium">발신</span>
                  <span className="text-slate-700">{selectedEmail.tags?.email_from || '-'}</span>
                  <span className="text-slate-500 font-medium">수신</span>
                  <span className="text-slate-700">{selectedEmail.tags?.email_to || '-'}</span>
                  <span className="text-slate-500 font-medium">날짜</span>
                  <span className="text-slate-700">
                    {selectedEmail.tags?.email_date
                      ? new Date(selectedEmail.tags.email_date).toLocaleString('ko-KR')
                      : new Date(selectedEmail.created_at).toLocaleString('ko-KR')}
                  </span>
                  {selectedEmail.customer_id && (
                    <>
                      <span className="text-slate-500 font-medium">고객사</span>
                      <span className="text-sky-700 font-semibold">{selectedEmail.customer_id}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 본문 */}
              <div
                className="bg-slate-50 rounded-2xl p-5 border border-slate-300 min-h-32"
                style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}
              >
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    본문 불러오는 중...
                  </div>
                ) : selectedEmail.content ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {selectedEmail.content}
                  </p>
                ) : selectedEmail.processing_status === 'processing' || selectedEmail.processing_status === 'pending' ? (
                  <p className="text-sm text-slate-500">처리 중입니다. 잠시 후 다시 시도하세요.</p>
                ) : (
                  <p className="text-sm text-slate-500">본문 내용이 없습니다.</p>
                )}
              </div>

              <Link
                href={`/?context=${selectedEmail.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  boxShadow: '0 2px 8px rgba(14,165,233,0.28)',
                }}
              >
                채팅으로 이동
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
