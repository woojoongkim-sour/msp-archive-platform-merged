'use client';

import { apiFetch } from '@/lib/apiFetch';

import { useState } from 'react';
import { Search } from 'lucide-react';


interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  customer_id: string | null;
  doc_type: string | null;
  created_at: string;
  processing_status: string;
  protection_type: string;
  searchable_scope: string;
}

const DOC_TYPES = [
  { label: '전체 유형', value: '' },
  { label: '운영매뉴얼', value: '운영매뉴얼' },
  { label: '장애보고서', value: '장애보고서' },
  { label: '작업보고서', value: '작업보고서' },
  { label: '이메일', value: 'email' },
  { label: '기타', value: '기타' },
];

function ResultBadges({ result }: { result: SearchResult }) {
  const badges: { label: string; cls: string }[] = [];

  if (result.searchable_scope === 'full') {
    badges.push({ label: 'VECTOR INDEXED', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' });
  } else if (result.searchable_scope === 'metadata_only' && result.processing_status !== 'blocked') {
    badges.push({ label: 'METADATA ONLY', cls: 'bg-slate-100 text-slate-500 border-slate-300' });
  }

  if (result.processing_status === 'blocked') {
    if (result.protection_type === 'password') {
      badges.push({ label: 'BLOCKED: PW', cls: 'bg-orange-50 text-orange-700 border-orange-200' });
    } else if (result.protection_type === 'drm') {
      badges.push({ label: 'BLOCKED: DRM', cls: 'bg-orange-50 text-orange-700 border-orange-200' });
    } else {
      badges.push({ label: 'BLOCKED', cls: 'bg-orange-50 text-orange-700 border-orange-200' });
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {badges.map(b => (
        <span key={b.label} className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${b.cls}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [docType, setDocType] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);
    try {
      const body: Record<string, unknown> = { query };
      if (customerId.trim()) body.customer_id = customerId.trim();
      if (docType) body.filters = { doc_type: docType };

      const res = await apiFetch(`/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">문서 검색</h1>
        <p className="text-slate-500 mt-1 text-sm">하이브리드 검색으로 관련 문서를 찾습니다.</p>
      </header>

      <div
        className="bg-white rounded-2xl border border-slate-300 p-5 space-y-4"
        style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)'}}
      >
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="검색어를 입력하세요..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.18)'}
            onBlur={e => e.currentTarget.style.boxShadow = 'none'}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2.5 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: '0 2px 8px rgba(14,165,233,0.30)',
            }}
          >
            <Search className="w-4 h-4" />
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="고객사 (예: 삼성전자)"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all w-56"
          />
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-400 transition-all"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="text-slate-500 text-sm animate-pulse p-4 text-center">검색 중...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div
          className="bg-white rounded-2xl border border-slate-300 p-10 text-center"
          style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}
        >
          <p className="text-slate-500 text-sm">검색 결과가 없습니다.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map(result => (
            <div
              key={result.id}
              className="bg-white rounded-2xl border border-slate-300 p-5 card-hover"
              style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)'}}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">📄</span>
                  <h3 className="text-sm font-semibold text-slate-800 truncate">
                    {result.title}
                  </h3>
                </div>
                <ResultBadges result={result} />
              </div>
              {result.snippet && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                  {result.snippet}
                </p>
              )}
              <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
                {result.customer_id && (
                  <span>고객사: <span className="text-slate-800 font-medium">{result.customer_id}</span></span>
                )}
                {result.doc_type && (
                  <span>유형: <span className="text-slate-800 font-medium">{result.doc_type}</span></span>
                )}
                {result.created_at && (
                  <span>{new Date(result.created_at).toLocaleDateString('ko-KR')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
