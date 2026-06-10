'use client';

import { apiFetch } from '@/lib/apiFetch';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface EventOccurrence {
  id: string;
  customer_id: string;
  event_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  host: string | null;
  service: string | null;
  first_seen_at: string;
  last_seen_at: string;
  current_status: 'open' | 'acknowledged' | 'resolved' | 'closed';
}

interface StateHistory {
  id: string;
  previous_state: string;
  new_state: string;
  changed_at: string;
  changed_by: string | null;
  source: string;
}

interface HandlingRecord {
  id: string;
  action_type: string;
  action_summary: string;
  actor: string;
  executed_at: string;
  result_status: string;
}

interface Assessment {
  id: string;
  recurrence_score: number | null;
  risk_score: number | null;
  pattern_summary: string | null;
  probable_cause: string | null;
  analyzer_type: string;
}

interface EventDetail extends EventOccurrence {
  state_histories: StateHistory[];
  handling_records: HandlingRecord[];
  assessments: Assessment[];
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  low:      'bg-sky-100 text-sky-700 border-sky-200',
  info:     'bg-slate-100 text-slate-800 border-slate-300',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-sky-1000',
  info:     'bg-slate-400',
};

const SEVERITY_GLOW: Record<string, string> = {
  critical: '0 0 6px rgba(239,68,68,0.5)',
  high:     '0 0 6px rgba(249,115,22,0.5)',
  medium:   '0 0 6px rgba(245,158,11,0.5)',
  low:      '0 0 6px rgba(14,165,233,0.5)',
  info:     'none',
};

const STATUS_STYLE: Record<string, string> = {
  open:         'bg-red-50 text-red-600 border-red-200',
  acknowledged: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:       'bg-slate-100 text-slate-500 border-slate-300',
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [customerFilter, setCustomerFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (customerFilter) params.set('customer_id', customerFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (statusFilter) params.set('status', statusFilter);
    const path = `/api/v1/events${params.toString() ? `?${params}` : ''}`;
    apiFetch(path)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setEvents(data);
        else if (Array.isArray(data?.items)) setEvents(data.items);
        else setEvents([]);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [customerFilter, severityFilter, statusFilter]);

  const handleSelectEvent = async (event: EventOccurrence) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/v1/events/${event.id}`);
      const data = await res.json();
      setSelectedEvent({
        ...event,
        state_histories: data.state_histories ?? [],
        handling_records: data.handling_records ?? [],
        assessments: data.assessments ?? [],
        ...data,
      });
    } catch {
      setSelectedEvent({ ...event, state_histories: [], handling_records: [], assessments: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('ko-KR'); } catch { return iso; }
  };

  const inputCls = "px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-400 transition-all";

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-6 py-3.5 border-b border-slate-300 bg-white shrink-0" style={{boxShadow: '0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="고객사 필터"
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            className={`${inputCls} w-36`}
          />
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={inputCls}>
            <option value="">전체 심각도</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">전체 상태</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Event list */}
        <div className="w-80 shrink-0 border-r border-slate-300 bg-slate-100 overflow-y-auto">
          {loading && <div className="p-4 text-sm text-slate-500 animate-pulse">로딩 중...</div>}
          {!loading && events.length === 0 && (
            <div className="p-6 text-sm text-slate-500 text-center leading-relaxed">
              이벤트 데이터가 없습니다.
            </div>
          )}
          {events.map(event => (
            <button
              key={event.id}
              onClick={() => handleSelectEvent(event)}
              className={`w-full text-left px-4 py-4 border-b border-slate-300 transition-colors ${
                selectedEvent?.id === event.id
                  ? 'bg-white border-l-2 border-l-sky-500'
                  : 'hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[event.severity] ?? 'bg-slate-400'}`}
                  style={{ boxShadow: SEVERITY_GLOW[event.severity] }}
                />
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase ${SEVERITY_STYLE[event.severity] ?? SEVERITY_STYLE['info']}`}>
                  {event.severity}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLE[event.current_status] ?? ''}`}>
                  {event.current_status}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{event.event_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {[event.host, event.customer_id].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{formatDate(event.last_seen_at)}</p>
            </button>
          ))}
        </div>

        {/* Event detail */}
        <div className="flex-1 overflow-y-auto bg-white p-6">
          {detailLoading && <div className="text-slate-500 text-sm animate-pulse">로딩 중...</div>}
          {!detailLoading && !selectedEvent && (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              이벤트를 선택하면 상세 정보가 표시됩니다.
            </div>
          )}
          {!detailLoading && selectedEvent && (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              <section>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">기본 정보</p>
                <div
                  className="bg-slate-50 rounded-2xl p-5 border border-slate-300 space-y-3"
                  style={{boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase ${SEVERITY_STYLE[selectedEvent.severity]}`}>
                      {selectedEvent.severity}
                    </span>
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${STATUS_STYLE[selectedEvent.current_status]}`}>
                      {selectedEvent.current_status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedEvent.event_name}</h3>
                  <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm mt-1">
                    {[
                      ['호스트', selectedEvent.host || '-'],
                      ['서비스', selectedEvent.service || '-'],
                      ['고객사', selectedEvent.customer_id],
                      ['첫 발생', formatDate(selectedEvent.first_seen_at)],
                      ['마지막 발생', formatDate(selectedEvent.last_seen_at)],
                    ].map(([k, v]) => (
                      <>
                        <span key={`k-${k}`} className="text-slate-500 font-medium">{k}</span>
                        <span key={`v-${k}`} className="text-slate-700">{v}</span>
                      </>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">상태 타임라인</p>
                {selectedEvent.state_histories.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 text-sm text-slate-500">상태 이력이 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedEvent.state_histories.map(h => (
                      <div key={h.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-300">
                        <span className="text-xs font-medium text-slate-800">{h.previous_state}</span>
                        <span className="text-slate-500 text-xs">→</span>
                        <span className="text-xs font-semibold text-sky-600">{h.new_state}</span>
                        <span className="ml-auto text-xs text-slate-500 shrink-0">{formatDate(h.changed_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">조치 기록</p>
                {selectedEvent.handling_records.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 text-sm text-slate-500">조치 기록이 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedEvent.handling_records.map(r => (
                      <div key={r.id} className="bg-slate-50 rounded-xl p-4 border border-slate-300">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-200 text-slate-800 font-semibold">{r.action_type}</span>
                          <span className="text-xs text-slate-500">{formatDate(r.executed_at)}</span>
                          <span className="text-xs text-slate-500 ml-auto">{r.actor}</span>
                        </div>
                        <p className="text-sm text-slate-700">{r.action_summary}</p>
                        <p className="text-xs text-slate-500 mt-1">결과: {r.result_status}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">AI 분석</p>
                {selectedEvent.assessments.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-300 text-sm text-slate-500">AI 분석 결과가 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedEvent.assessments.map(a => (
                      <div key={a.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-300 space-y-2" style={{boxShadow: '0 0 0 1px rgba(14,165,233,0.08), 0 4px 12px rgba(14,165,233,0.05)'}}>
                        <div className="flex gap-4 text-sm">
                          {a.recurrence_score !== null && (
                            <span className="text-slate-500">반복 점수: <span className="font-bold text-slate-800">{a.recurrence_score}</span></span>
                          )}
                          {a.risk_score !== null && (
                            <span className="text-slate-500">위험도: <span className="font-bold text-slate-800">{a.risk_score}</span></span>
                          )}
                        </div>
                        {a.probable_cause && <p className="text-sm text-slate-700">원인: {a.probable_cause}</p>}
                        {a.pattern_summary && <p className="text-sm text-slate-500">{a.pattern_summary}</p>}
                        <p className="text-xs text-slate-500">분석기: {a.analyzer_type}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <Link
                href={`/?context=event:${selectedEvent.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  boxShadow: '0 2px 8px rgba(14,165,233,0.30)',
                }}
              >
                이 이벤트로 채팅하기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
