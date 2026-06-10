'use client';

import { apiFetch } from '@/lib/apiFetch';

import { useState, useEffect, useRef } from 'react';


interface DocumentItem {
  id: string;
  title: string;
  file_format: string | null;
  processing_status: string;
  protection_type: string;
  customer_id: string | null;
  created_at: string;
  processing_error_reason?: string | null;
}

interface DomainMapping {
  domain: string;
  customer_id: string;
}

const STATUS_STYLE: Record<string, string> = {
  blocked:                    'bg-orange-50 text-orange-700 border-orange-200',
  awaiting_manual_refinement: 'bg-amber-50 text-amber-700 border-amber-200',
  failed:                     'bg-red-50 text-red-600 border-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  blocked:                    'BLOCKED',
  awaiting_manual_refinement: 'NEEDS REFINEMENT',
  failed:                     'FAILED',
};

type AdminTab = 'protected' | 'failed' | 'domains' | 'audit' | 'users';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'protected', label: '보호 문서' },
  { key: 'failed',    label: '처리 실패' },
  { key: 'domains',   label: '도메인-고객사 매핑' },
  { key: 'audit',     label: '감사 로그' },
  { key: 'users',     label: '사용자 관리' },
];

const thTwCls = "px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider";
const tdCls = "px-4 py-3 text-sm text-slate-800";

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border border-slate-300 rounded-xl overflow-hidden bg-white"
      style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)'}}
    >
      {children}
    </div>
  );
}

function ProtectedTab() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/v1/documents?processing_status=blocked`).then(r => r.json()),
      apiFetch(`/api/v1/documents?processing_status=awaiting_manual_refinement`).then(r => r.json()),
    ])
      .then(([blocked, awaiting]) => {
        setDocs([
          ...(Array.isArray(blocked) ? blocked : []),
          ...(Array.isArray(awaiting) ? awaiting : []),
        ]);
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (doc: DocumentItem) => {
    const input = fileRefs.current[doc.id];
    const file = input?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch(`/api/v1/documents/${doc.id}/refine`, { method: 'POST', body: formData });
    if (res.ok) { alert('업로드 완료'); if (input) input.value = ''; }
    else alert('업로드 실패');
  };

  if (loading) return <div className="text-slate-500 text-sm animate-pulse p-4">로딩 중...</div>;

  return (
    <TableShell>
      <table className="w-full text-left border-collapse">
        <thead className="border-b border-slate-300 bg-slate-100">
          <tr>
            <th className={thTwCls}>제목</th>
            <th className={thTwCls}>보호 유형</th>
            <th className={thTwCls}>상태</th>
            <th className={thTwCls}>고객사</th>
            <th className={thTwCls}>업로드일</th>
            <th className={thTwCls}>정제본 업로드</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {docs.length === 0 && (
            <tr><td colSpan={6} className="py-10 text-center text-slate-500 text-sm">보호 문서가 없습니다.</td></tr>
          )}
          {docs.map(doc => (
            <tr key={doc.id} className="hover:bg-slate-100 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-xs truncate">{doc.title}</td>
              <td className={tdCls}>{doc.protection_type === 'none' ? '일반' : doc.protection_type}</td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${STATUS_STYLE[doc.processing_status] ?? ''}`}>
                  {STATUS_LABEL[doc.processing_status] ?? doc.processing_status.toUpperCase()}
                </span>
              </td>
              <td className={tdCls}>{doc.customer_id || '-'}</td>
              <td className={tdCls}>{new Date(doc.created_at).toLocaleDateString('ko-KR')}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".txt,.md"
                    ref={(el) => { fileRefs.current[doc.id] = el; }}
                    className="text-xs text-slate-500 w-32"
                  />
                  <button
                    onClick={() => handleUpload(doc)}
                    className="px-3 py-1 text-white text-xs font-semibold rounded-lg transition-all"
                    style={{background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', boxShadow: '0 1px 6px rgba(14,165,233,0.28)'}}
                  >
                    업로드
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function FailedTab() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/documents?processing_status=failed`)
      .then(r => r.json())
      .then(data => setDocs(Array.isArray(data) ? data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-sm animate-pulse p-4">로딩 중...</div>;

  return (
    <TableShell>
      <table className="w-full text-left border-collapse">
        <thead className="border-b border-slate-300 bg-slate-100">
          <tr>
            <th className={thTwCls}>제목</th>
            <th className={thTwCls}>오류 이유</th>
            <th className={thTwCls}>고객사</th>
            <th className={thTwCls}>업로드일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {docs.length === 0 && (
            <tr><td colSpan={4} className="py-10 text-center text-slate-500 text-sm">처리 실패 문서가 없습니다.</td></tr>
          )}
          {docs.map(doc => (
            <tr key={doc.id} className="hover:bg-slate-100 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-xs truncate">{doc.title}</td>
              <td className="px-4 py-3 text-sm text-red-500 max-w-sm">{doc.processing_error_reason || '-'}</td>
              <td className={tdCls}>{doc.customer_id || '-'}</td>
              <td className={tdCls}>{new Date(doc.created_at).toLocaleDateString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function DomainsTab() {
  const [mappings, setMappings] = useState<DomainMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/v1/email/domain-map`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMappings(data);
        } else if (data && typeof data === 'object') {
          setMappings(Object.entries(data).map(([domain, customer_id]) => ({ domain, customer_id: String(customer_id) })));
        } else {
          setMappings([]);
        }
      })
      .catch(() => { setError(true); setMappings([]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-sm animate-pulse p-4">로딩 중...</div>;
  if (error) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
      도메인 매핑 API에 연결할 수 없습니다.
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-sky-100 border border-sky-200 rounded-xl p-4 text-sm text-sky-700">
        매핑 편집은 서버의 <code className="font-mono bg-sky-100 px-1.5 py-0.5 rounded text-sky-800">customer_domain_map.json</code> 파일을 직접 수정하세요.
      </div>
      <TableShell>
        <table className="w-full text-left border-collapse">
          <thead className="border-b border-slate-300 bg-slate-100">
            <tr>
              <th className={thTwCls}>도메인</th>
              <th className={thTwCls}>고객사</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mappings.length === 0 && (
              <tr><td colSpan={2} className="py-10 text-center text-slate-500 text-sm">매핑 데이터가 없습니다.</td></tr>
            )}
            {mappings.map(m => (
              <tr key={m.domain} className="hover:bg-slate-100 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-slate-700">{m.domain}</td>
                <td className="px-4 py-3 text-sm text-slate-800">{m.customer_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function AuditTab() {
  return (
    <div className="bg-slate-100 rounded-2xl p-10 border border-slate-300 text-center" style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}>
      <p className="text-sm text-slate-500">감사 로그 API가 준비 중입니다.</p>
    </div>
  );
}

interface UserItem {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

function UsersTab() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchUsers = () => {
    setLoading(true);
    apiFetch('/api/v1/auth/users')
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await apiFetch('/api/v1/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      if (res.ok) {
        setEmail(''); setPassword(''); setRole('user');
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.detail || '생성에 실패했습니다');
      }
    } catch {
      setCreateError('네트워크 오류');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, userEmail: string) => {
    if (!confirm(`${userEmail} 계정을 삭제하시겠습니까?`)) return;
    const res = await apiFetch(`/api/v1/auth/users/${id}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
    else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || '삭제에 실패했습니다');
    }
  };

  return (
    <div className="space-y-6">
      {/* 신규 사용자 등록 */}
      <div
        className="bg-white border border-slate-300 rounded-xl p-6"
        style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)'}}
      >
        <h3 className="text-sm font-semibold text-slate-800 mb-4">신규 사용자 등록</h3>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="name@itcen.com"
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">역할</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'user' | 'admin')}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-sky-400"
            >
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-60"
            style={{background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', boxShadow: '0 1px 6px rgba(14,165,233,0.28)'}}
          >
            {creating ? '등록 중...' : '등록'}
          </button>
        </form>
        {createError && (
          <p className="mt-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
        )}
      </div>

      {/* 사용자 목록 */}
      {loading ? (
        <div className="text-slate-500 text-sm animate-pulse p-4">로딩 중...</div>
      ) : (
        <TableShell>
          <table className="w-full text-left border-collapse">
            <thead className="border-b border-slate-300 bg-slate-100">
              <tr>
                <th className={thTwCls}>이메일</th>
                <th className={thTwCls}>역할</th>
                <th className={thTwCls}>상태</th>
                <th className={thTwCls}>등록일</th>
                <th className={thTwCls}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-500 text-sm">등록된 사용자가 없습니다.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-100 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-800 font-mono">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-sky-100 text-sky-700 border border-sky-200">ADMIN</span>
                    ) : (
                      <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">USER</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      className="px-3 py-1 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('protected');

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">관리자</h1>
        <p className="text-slate-500 mt-1 text-sm">보호 문서 처리, 도메인 매핑, 감사 로그를 관리합니다.</p>
      </header>

      <div className="flex gap-0 border-b border-slate-300">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'protected' && <ProtectedTab />}
        {activeTab === 'failed'    && <FailedTab />}
        {activeTab === 'domains'   && <DomainsTab />}
        {activeTab === 'audit'     && <AuditTab />}
        {activeTab === 'users'     && <UsersTab />}
      </div>
    </div>
  );
}
