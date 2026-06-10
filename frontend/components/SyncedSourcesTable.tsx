'use client';

import { apiFetch } from '@/lib/apiFetch';

import useSWR from 'swr';
import { Trash2 } from 'lucide-react';

const fetcher = (path: string) => apiFetch(path).then(res => {
  if (!res.ok) throw new Error('API error');
  return res.json();
});

interface Document {
  id: string;
  title: string;
  file_format: string | null;
  processing_status: string;
  indexing_status: string;
  protection_type: string;
  customer_id: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  completed:                    'bg-emerald-50 text-emerald-700 border-emerald-200',
  indexed:                      'bg-emerald-50 text-emerald-700 border-emerald-200',
  processing:                   'bg-sky-100 text-sky-700 border-sky-200',
  pending:                      'bg-slate-100 text-slate-500 border-slate-300',
  blocked:                      'bg-orange-50 text-orange-700 border-orange-200',
  awaiting_manual_refinement:   'bg-amber-50 text-amber-700 border-amber-200',
  failed:                       'bg-red-50 text-red-600 border-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  completed:                  'INDEXED',
  processing:                 'PROCESSING',
  pending:                    'PENDING',
  blocked:                    'BLOCKED',
  awaiting_manual_refinement: 'NEEDS REFINEMENT',
  failed:                     'FAILED',
};

export default function SyncedSourcesTable() {
  const { data, error, mutate } = useSWR<Document[]>(
    `/api/v1/documents`,
    fetcher,
    { refreshInterval: 4000 }
  );

  const handleDelete = async (id: string) => {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return;
    const res = await apiFetch(`/api/v1/documents/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      mutate();
    } else {
      alert('삭제에 실패했습니다.');
    }
  };

  if (error) return (
    <div className="text-red-500 text-sm font-medium p-4 bg-red-50 rounded-xl border border-red-200">
      API 연결 실패. 백엔드를 확인하세요.
    </div>
  );
  if (!data) return (
    <div className="p-4 text-slate-500 text-sm animate-pulse">로딩 중...</div>
  );

  return (
    <div
      className="border border-slate-300 rounded-xl overflow-hidden bg-white"
      style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)'}}
    >
      <table className="w-full text-left border-collapse">
        <thead className="border-b border-slate-300 bg-slate-100">
          <tr>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">문서명</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">형식</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">처리 상태</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">보호 유형</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">업로드</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">작업</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                업로드된 문서가 없습니다.
              </td>
            </tr>
          )}
          {data.map(doc => (
            <tr key={doc.id} className="hover:bg-slate-100 transition-colors group">
              <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-xs truncate">
                {doc.title}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                {doc.file_format || '-'}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${STATUS_STYLE[doc.processing_status] ?? STATUS_STYLE['pending']}`}>
                  {STATUS_LABEL[doc.processing_status] ?? doc.processing_status.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {doc.protection_type === 'none' ? '일반' : doc.protection_type}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {new Date(doc.created_at).toLocaleString('ko-KR')}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
