"use client";

import { useState, useEffect, useRef } from 'react';
import { Send, X, Loader2, FileText } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type SourceDoc = {
  id: string;
  title: string;
  protection_type: string;
  processing_status: string;
};

type DocContent = {
  id: string;
  title: string;
  protection_type: string;
  processing_status: string;
  customer_id: string | null;
  content: string | null;
  chunk_count: number;
};

function SourceModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [data, setData] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/v1/documents/${docId}/content`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [docId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* panel */}
      <div
        className="relative bg-white rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden animate-fade-in"
        style={{boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)'}}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-300 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(56,189,248,0.08) 100%)',
                boxShadow: '0 0 0 1px rgba(14,165,233,0.2)',
              }}
            >
              <FileText size={15} className="text-sky-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {loading ? '로딩 중...' : (data?.title ?? '문서')}
              </p>
              {data?.customer_id && (
                <p className="text-xs text-slate-500 mt-0.5">{data.customer_id}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* badges */}
        {!loading && data && (
          <div className="flex gap-2 px-5 pt-3 shrink-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              data.protection_type === 'none'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-orange-50 text-orange-700 border-orange-200'
            }`}>
              {data.protection_type === 'none' ? '일반 문서' : data.protection_type.toUpperCase()}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-bold">
              {data.chunk_count > 0 ? `${data.chunk_count}개 청크` : '미인덱싱'}
            </span>
          </div>
        )}

        {/* content */}
        <div className="flex-1 overflow-y-auto p-5 pt-3">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" />
              본문 불러오는 중...
            </div>
          ) : !data?.content ? (
            <div className="py-8 text-center">
              <p className="text-slate-500 text-sm">
                {data?.protection_type !== 'none'
                  ? '보호된 문서라 본문을 표시할 수 없습니다.'
                  : '본문 내용이 없습니다.'}
              </p>
            </div>
          ) : (
            <div
              className="bg-slate-50 rounded-xl p-4 border border-slate-300"
              style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}
            >
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                {data.content}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [modalDocId, setModalDocId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const query = inputValue.trim();
    setInputValue('');
    setIsStreaming(true);
    setSources([]);

    setMessages(prev => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '' },
    ]);

    try {
      const response = await apiFetch(
        `/api/v1/chat/completions?message=${encodeURIComponent(query)}`
      );

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIdx).trim();
          buffer = buffer.substring(newlineIdx + 1);

          if (!line.startsWith('data: ')) continue;
          const raw = line.substring(6).trim();
          if (raw === '[DONE]') break;
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === 'sources') {
              setSources(event.data);
            } else if (event.type === 'token') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + event.data };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '백엔드 연결에 실패했습니다.',
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col h-full bg-slate-100">
        <div ref={chatContainerRef} className="flex-grow p-6 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center mt-24 animate-fade-in">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 text-white text-2xl font-bold"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
                  boxShadow: '0 4px 20px rgba(14,165,233,0.35), 0 0 40px rgba(14,165,233,0.15)',
                }}
              >
                M
              </div>
              <h1 className="text-3xl font-bold mb-2 text-slate-800 tracking-tight">
                MSP Archive Platform
              </h1>
              <p className="text-slate-500">운영 문서를 업로드하고 질문하세요.</p>
              <p className="text-sm text-slate-500 mt-1.5">
                좌측 사이드바 &gt; 문서에서 파일을 업로드할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl mx-auto">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl max-w-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white rounded-br-sm'
                        : 'bg-white text-slate-800 rounded-bl-sm border border-slate-300'
                    }`}
                    style={msg.role === 'user' ? {
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      boxShadow: '0 2px 8px rgba(14,165,233,0.30), 0 4px 16px rgba(14,165,233,0.15)',
                    } : {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                    }}
                  >
                    {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{animationDelay: '0ms'}} />
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{animationDelay: '150ms'}} />
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{animationDelay: '300ms'}} />
                      </span>
                    ) : (
                      <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65' }}>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="p-4 border-t border-slate-300 bg-white shrink-0" style={{boxShadow: '0 -2px 12px rgba(0,0,0,0.04)'}}>
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              placeholder="운영 문서에 대해 질문하세요..."
              className="w-full py-3.5 pl-5 pr-14 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 transition-all disabled:opacity-50"
              style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.18), 0 1px 3px rgba(0,0,0,0.04)'}
              onBlur={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              disabled={isStreaming}
            />
            <button
              onClick={handleSendMessage}
              disabled={isStreaming}
              className="absolute right-2.5 top-2.5 w-9 h-9 flex items-center justify-center rounded-lg text-white transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Inspector 패널 */}
      <div
        className="w-72 shrink-0 border-l border-slate-300 bg-white p-5 hidden lg:flex flex-col overflow-y-auto"
        style={{boxShadow: '-2px 0 12px rgba(0,0,0,0.03)'}}
      >
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
          참조 문서
        </h2>
        {sources.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-300">
            <p className="text-xs text-slate-500 leading-relaxed">질문하면 참조된 문서가 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sources.map(src => (
              <button
                key={src.id}
                onClick={() => setModalDocId(src.id)}
                className="w-full text-left rounded-xl border border-slate-300 p-3 bg-white transition-all group"
                style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)'}}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(14,165,233,0.12), 0 0 0 1px rgba(14,165,233,0.2)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#bae6fd';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                }}
              >
                <div className="flex items-start gap-2">
                  <FileText size={13} className="text-sky-400 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-slate-700 leading-snug">{src.title}</p>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    src.protection_type === 'none'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-orange-50 text-orange-600 border-orange-200'
                  }`}>
                    {src.protection_type === 'none' ? '일반' : src.protection_type}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-600 border border-sky-200 font-semibold">
                    {src.processing_status}
                  </span>
                </div>
                <p className="text-[10px] text-sky-500 mt-1.5 group-hover:text-sky-600 transition-colors">
                  클릭하여 본문 보기 →
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 소스 문서 팝업 모달 */}
      {modalDocId && (
        <SourceModal docId={modalDocId} onClose={() => setModalDocId(null)} />
      )}
    </div>
  );
}
