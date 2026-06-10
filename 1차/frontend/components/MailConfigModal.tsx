'use client';

import { useState, useEffect } from 'react';
import { X, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

interface MailConfig {
  host: string;
  port: number;
  protocol: string;
  username: string;
  use_ssl: boolean;
  has_config: boolean;
}

interface Props {
  onClose: () => void;
}

const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

export default function MailConfigModal({ onClose }: Props) {
  const [host, setHost] = useState('webmail.cengroup.co.kr');
  const [port, setPort] = useState(110);
  const [protocol, setProtocol] = useState('pop3');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useSsl, setUseSsl] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState('');

  // 기존 설정 불러오기
  useEffect(() => {
    apiFetch('/api/v1/auth/mail-config')
      .then(r => r.json())
      .then(data => {
        if (data && data.has_config !== false) {
          setHost(data.host || 'webmail.cengroup.co.kr');
          setPort(data.port || 110);
          setProtocol(data.protocol || 'pop3');
          setUsername(data.username || '');
          setUseSsl(data.use_ssl || false);
          setHasExisting(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/v1/auth/mail-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, protocol, username, password, use_ssl: useSsl }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message });
      } else {
        setTestResult({ ok: false, message: data.detail || '연결 실패' });
      }
    } catch {
      setTestResult({ ok: false, message: '네트워크 오류' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/auth/mail-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, protocol, username, password, use_ssl: useSsl }),
      });
      if (res.ok) {
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail || '저장에 실패했습니다');
      }
    } catch {
      setSaveError('네트워크 오류');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('메일 계정 설정을 삭제하시겠습니까?')) return;
    await apiFetch('/api/v1/auth/mail-config', { method: 'DELETE' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)' }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Mail size={16} className="text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-800">메일 계정 설정</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>메일 서버 (Host)</label>
              <input className={inputCls} value={host} onChange={e => setHost(e.target.value)}
                placeholder="webmail.cengroup.co.kr" required />
            </div>
            <div>
              <label className={labelCls}>포트</label>
              <input className={inputCls} type="number" value={port}
                onChange={e => setPort(Number(e.target.value))} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>프로토콜</label>
              <select className={inputCls} value={protocol} onChange={e => setProtocol(e.target.value)}>
                <option value="pop3">POP3</option>
                <option value="imap">IMAP</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="ssl" checked={useSsl}
                onChange={e => setUseSsl(e.target.checked)}
                className="w-4 h-4 accent-sky-500" />
              <label htmlFor="ssl" className="text-sm text-slate-600 font-medium">SSL/TLS 사용</label>
            </div>
          </div>

          <div>
            <label className={labelCls}>이메일 계정 (Username)</label>
            <input className={inputCls} type="email" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="name@itcen.com" required />
          </div>

          <div>
            <label className={labelCls}>비밀번호</label>
            <input className={inputCls} type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={hasExisting ? '변경 시에만 입력' : '••••••••'}
              required={!hasExisting} />
            {hasExisting && (
              <p className="text-[11px] text-slate-400 mt-1">저장된 설정이 있습니다. 비밀번호 변경 시에만 입력하세요.</p>
            )}
          </div>

          {/* 연결 테스트 결과 */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
              testResult.ok
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {testResult.ok
                ? <CheckCircle size={14} className="shrink-0 mt-0.5" />
                : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              {testResult.message}
            </div>
          )}

          {saveError && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
          )}

          {/* 버튼 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !host || !port || !username || (!hasExisting && !password)}
              className="px-4 py-2 text-xs font-semibold text-sky-600 border border-sky-300 rounded-lg hover:bg-sky-50 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {testing && <Loader2 size={12} className="animate-spin" />}
              연결 테스트
            </button>
            <div className="flex-1" />
            {hasExisting && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-all"
              >
                삭제
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white rounded-lg transition-all disabled:opacity-60 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', boxShadow: '0 1px 6px rgba(14,165,233,0.28)' }}
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
