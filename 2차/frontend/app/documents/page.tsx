'use client';

import { apiFetch } from '@/lib/apiFetch';
import { useState, useMemo, useRef, useEffect } from 'react';
import useSWR from 'swr';
import FileUpload from '@/components/FileUpload';
import DocumentDetailPanel, { DocumentItem } from '@/components/DocumentDetailPanel';
import {
  Trash2, Folder, FolderOpen, ChevronRight, ChevronDown, FileText,
  Pencil, Plus, X, FolderInput, Check,
} from 'lucide-react';

const fetcher = (path: string) => apiFetch(path).then(res => {
  if (!res.ok) throw new Error('API error');
  return res.json();
});

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

const thCls = "px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left";

type Selection = { customer: string | null; docType: string | null };

// ── 문서 이동 모달 ─────────────────────────────────────────────

function MoveDocModal({
  doc,
  customerOptions,
  onMove,
  onClose,
}: {
  doc: DocumentItem;
  customerOptions: string[];
  onMove: (id: string, customer: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string>(doc.customer_id ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await onMove(doc.id, target || null);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
      <div
        className="bg-white rounded-2xl p-6 w-80 shadow-2xl"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 text-sm">고객사 폴더 이동</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3 truncate bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          {doc.title}
        </p>
        <select
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-sky-400"
          value={target}
          onChange={e => setTarget(e.target.value)}
        >
          <option value="">미분류</option>
          {customerOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 text-sm text-white rounded-lg disabled:opacity-60 transition-all"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}
          >
            {loading ? '이동 중...' : '이동'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 인라인 이름 편집 입력 ─────────────────────────────────────

function InlineInput({
  defaultValue,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  onSubmit: (val: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const submit = () => { if (val.trim()) onSubmit(val.trim()); };

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-sky-400 rounded text-slate-800 bg-white focus:outline-none"
        style={{ maxWidth: '100%' }}
      />
      <button
        onMouseDown={e => { e.preventDefault(); submit(); }}
        className="shrink-0 text-emerald-500 hover:text-emerald-700"
      >
        <Check size={12} />
      </button>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────

export default function DocumentsPage() {
  const [selection, setSelection] = useState<Selection>({ customer: null, docType: null });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // 폴더 관리 상태
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerInput, setNewCustomerInput] = useState('');
  const [renamingCustomer, setRenamingCustomer] = useState<string | null>(null);
  const [renamingDoctype, setRenamingDoctype] = useState<{ customer: string; doctype: string } | null>(null);
  const [showNewDoctype, setShowNewDoctype] = useState<string | null>(null);
  const [newDoctypeInput, setNewDoctypeInput] = useState('');
  const [movingDoc, setMovingDoc] = useState<DocumentItem | null>(null);

  const { data: allDocs, error, mutate } = useSWR<DocumentItem[]>(
    '/api/v1/documents',
    fetcher,
    { refreshInterval: 8000 }
  );

  // 고객사 → doc_type 트리 집계
  const customerTree = useMemo(() => {
    if (!allDocs) return [];
    const tree: Record<string, Record<string, number>> = {};
    for (const doc of allDocs) {
      const customer = doc.customer_id || '미분류';
      const type = doc.doc_type || '기타';
      if (!tree[customer]) tree[customer] = {};
      tree[customer][type] = (tree[customer][type] || 0) + 1;
    }
    return Object.entries(tree)
      .map(([customer, types]) => ({
        customer,
        total: Object.values(types).reduce((a, b) => a + b, 0),
        types: Object.entries(types).sort((a, b) => b[1] - a[1]),
      }))
      .sort((a, b) => b.total - a.total);
  }, [allDocs]);

  // 실제 고객사 목록 (로컬 빈 폴더 포함)
  const allCustomerNames = useMemo(() => {
    const real = new Set(customerTree.map(c => c.customer));
    const extras = localFolders.filter(f => !real.has(f));
    return [...customerTree.map(c => c.customer), ...extras];
  }, [customerTree, localFolders]);

  // 실제 폴더 목록 (로컬 폴더 포함)
  const mergedTree = useMemo(() => {
    const real = new Set(customerTree.map(c => c.customer));
    const extras = localFolders.filter(f => !real.has(f));
    return [
      ...customerTree,
      ...extras.map(f => ({ customer: f, total: 0, types: [] as [string, number][] })),
    ];
  }, [customerTree, localFolders]);

  // 로컬 폴더 중 이제 실제 데이터에 있는 것은 정리
  useEffect(() => {
    if (!allDocs) return;
    const real = new Set(customerTree.map(c => c.customer));
    setLocalFolders(prev => prev.filter(f => !real.has(f)));
  }, [customerTree, allDocs]);

  // 필터링된 문서 목록
  const filteredDocs = useMemo(() => {
    if (!allDocs) return [];
    let docs = allDocs;
    if (selection.customer !== null) {
      docs = docs.filter(d =>
        selection.customer === '미분류' ? !d.customer_id : d.customer_id === selection.customer
      );
    }
    if (selection.docType !== null) {
      docs = docs.filter(d => (d.doc_type || '기타') === selection.docType);
    }
    if (statusFilter) {
      docs = docs.filter(d => d.processing_status === statusFilter);
    }
    return docs;
  }, [allDocs, selection, statusFilter]);

  const toggleExpand = (customer: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  };

  const selectCustomer = (customer: string | null) => {
    setSelection({ customer, docType: null });
    setStatusFilter(null);
  };

  const selectDocType = (customer: string, docType: string) => {
    setSelection({ customer, docType });
    setStatusFilter(null);
  };

  const isCustomerActive = (customer: string | null) =>
    selection.customer === customer && selection.docType === null;

  // ── 폴더 관리 핸들러 ────────────────────────────────────────

  const handleAddLocalFolder = () => {
    const name = newCustomerInput.trim();
    if (!name || allCustomerNames.includes(name)) return;
    setLocalFolders(prev => [...prev, name]);
    setNewCustomerInput('');
    setShowNewCustomer(false);
    setExpandedCustomers(prev => new Set(prev).add(name));
  };

  const handleRenameCustomer = async (oldName: string, newName: string) => {
    if (!newName || newName === oldName) { setRenamingCustomer(null); return; }
    await apiFetch('/api/v1/documents/folders/rename-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    if (selection.customer === oldName) setSelection({ customer: newName, docType: null });
    setRenamingCustomer(null);
    mutate();
  };

  const handleDeleteCustomer = async (customerName: string) => {
    const total = customerTree.find(c => c.customer === customerName)?.total ?? 0;
    const msg = total > 0
      ? `'${customerName}' 폴더를 삭제하시겠습니까?\n폴더 내 ${total}개 문서가 미분류로 이동됩니다.`
      : `'${customerName}' 폴더를 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    if (total > 0) {
      await apiFetch('/api/v1/documents/folders/delete-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerName }),
      });
    }
    setLocalFolders(prev => prev.filter(f => f !== customerName));
    if (selection.customer === customerName) setSelection({ customer: null, docType: null });
    mutate();
  };

  const handleRenameDoctype = async (customer: string, oldDoctype: string, newDoctype: string) => {
    if (!newDoctype || newDoctype === oldDoctype) { setRenamingDoctype(null); return; }
    await apiFetch('/api/v1/documents/folders/rename-doctype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customer, old_doc_type: oldDoctype, new_doc_type: newDoctype }),
    });
    if (selection.customer === customer && selection.docType === oldDoctype)
      setSelection({ customer, docType: newDoctype });
    setRenamingDoctype(null);
    mutate();
  };

  const handleAddDoctype = async (customer: string) => {
    const name = newDoctypeInput.trim();
    if (!name) return;
    setShowNewDoctype(null);
    setNewDoctypeInput('');
    // sub-folder is virtual until a doc is moved in — just expand so user can see it
    setExpandedCustomers(prev => new Set(prev).add(customer));
  };

  const handleMoveDoc = async (docId: string, customerId: string | null) => {
    await apiFetch(`/api/v1/documents/${docId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    });
    setMovingDoc(null);
    mutate();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return;
    const res = await apiFetch(`/api/v1/documents/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      if (selectedDoc?.id === id) setSelectedDoc(null);
      mutate();
    } else {
      alert('삭제에 실패했습니다.');
    }
  };

  const breadcrumb = [
    selection.customer ?? '전체',
    selection.docType,
  ].filter(Boolean).join(' / ');

  return (
    <div className="flex h-full overflow-hidden">
      {/* 왼쪽 고객사 디렉토리 패널 */}
      <aside
        className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto"
        style={{ boxShadow: '1px 0 8px rgba(0,0,0,0.03)' }}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">고객사</p>
          <button
            onClick={() => { setShowNewCustomer(v => !v); setNewCustomerInput(''); }}
            title="새 폴더"
            className="text-slate-400 hover:text-sky-500 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* 새 고객사 폴더 입력 */}
        {showNewCustomer && (
          <div className="px-3 py-2 border-b border-slate-100 bg-sky-50 flex items-center gap-1.5">
            <input
              autoFocus
              value={newCustomerInput}
              onChange={e => setNewCustomerInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddLocalFolder();
                if (e.key === 'Escape') setShowNewCustomer(false);
              }}
              placeholder="폴더 이름..."
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-sky-300 rounded text-slate-800 bg-white focus:outline-none"
            />
            <button onClick={handleAddLocalFolder} className="text-emerald-500 hover:text-emerald-600 shrink-0">
              <Check size={13} />
            </button>
            <button onClick={() => setShowNewCustomer(false)} className="text-slate-400 hover:text-slate-600 shrink-0">
              <X size={13} />
            </button>
          </div>
        )}

        <nav className="flex-1 py-1 overflow-y-auto">
          {/* 전체 */}
          <button
            onClick={() => selectCustomer(null)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              isCustomerActive(null)
                ? 'bg-sky-50 text-sky-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {isCustomerActive(null)
              ? <FolderOpen size={15} className="text-sky-500 shrink-0" />
              : <Folder size={15} className="text-slate-400 shrink-0" />}
            <span className="flex-1 text-left truncate">전체</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isCustomerActive(null) ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'
            }`}>
              {allDocs?.length ?? 0}
            </span>
          </button>

          {/* 고객사별 */}
          {mergedTree.map(({ customer, total, types }) => {
            const expanded = expandedCustomers.has(customer);
            const active = isCustomerActive(customer);
            const isRenamingThis = renamingCustomer === customer;

            return (
              <div key={customer}>
                {/* 고객사 행 */}
                <div className={`group flex items-center transition-colors ${
                  active ? 'bg-sky-50' : 'hover:bg-slate-50'
                }`}>
                  {/* 펼치기 화살표 */}
                  <button
                    onClick={(e) => toggleExpand(customer, e)}
                    className="pl-3 pr-1 py-2.5 text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>

                  {isRenamingThis ? (
                    /* 인라인 이름 편집 */
                    <div className="flex-1 pr-2 py-1.5 min-w-0">
                      <InlineInput
                        defaultValue={customer}
                        onSubmit={val => handleRenameCustomer(customer, val)}
                        onCancel={() => setRenamingCustomer(null)}
                      />
                    </div>
                  ) : (
                    <>
                      {/* 고객사 이름 클릭 → 선택 */}
                      <button
                        onClick={() => selectCustomer(customer)}
                        className={`flex-1 flex items-center gap-1.5 py-2.5 text-sm min-w-0 ${
                          active ? 'text-sky-700 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {active
                          ? <FolderOpen size={14} className="text-sky-500 shrink-0" />
                          : <Folder size={14} className="text-slate-400 shrink-0" />}
                        <span className="flex-1 text-left truncate">{customer}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          active ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {total}
                        </span>
                      </button>
                      {/* 폴더 액션 버튼 (hover 시 표시) */}
                      <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingCustomer(customer); }}
                          title="이름 변경"
                          className="p-1 text-slate-400 hover:text-sky-500 rounded"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(customer); }}
                          title="폴더 삭제"
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* 펼쳐진 경우: doc_type 서브 항목 */}
                {expanded && (
                  <>
                    {types.map(([type, count]) => {
                      const subActive = selection.customer === customer && selection.docType === type;
                      const isRenamingThis = renamingDoctype?.customer === customer && renamingDoctype.doctype === type;

                      return (
                        <div key={type} className={`group/sub flex items-center transition-colors ${
                          subActive ? 'bg-sky-50' : 'hover:bg-slate-50'
                        }`}>
                          {isRenamingThis ? (
                            <div className="flex-1 pl-10 pr-3 py-1 min-w-0">
                              <InlineInput
                                defaultValue={type}
                                onSubmit={val => handleRenameDoctype(customer, type, val)}
                                onCancel={() => setRenamingDoctype(null)}
                              />
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => selectDocType(customer, type)}
                                className={`flex-1 flex items-center gap-2 pl-9 pr-2 py-2 text-xs transition-colors ${
                                  subActive
                                    ? 'text-sky-600 font-semibold'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                <FileText size={12} className={subActive ? 'text-sky-400' : 'text-slate-400'} />
                                <span className="flex-1 text-left truncate">{type}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  subActive ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {count}
                                </span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setRenamingDoctype({ customer, doctype: type }); }}
                                title="이름 변경"
                                className="mr-2 p-1 text-slate-400 hover:text-sky-500 rounded opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0"
                              >
                                <Pencil size={10} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* 새 하위폴더 입력 */}
                    {showNewDoctype === customer ? (
                      <div className="pl-9 pr-3 py-1 flex items-center gap-1.5 bg-sky-50">
                        <FileText size={11} className="text-sky-400 shrink-0" />
                        <input
                          autoFocus
                          value={newDoctypeInput}
                          onChange={e => setNewDoctypeInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddDoctype(customer);
                            if (e.key === 'Escape') { setShowNewDoctype(null); setNewDoctypeInput(''); }
                          }}
                          placeholder="하위폴더 이름..."
                          className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-sky-300 rounded bg-white focus:outline-none"
                        />
                        <button onClick={() => handleAddDoctype(customer)} className="text-emerald-500 shrink-0">
                          <Check size={11} />
                        </button>
                        <button onClick={() => { setShowNewDoctype(null); setNewDoctypeInput(''); }} className="text-slate-400 shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setShowNewDoctype(customer); setNewDoctypeInput(''); }}
                        className="w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-[11px] text-slate-400 hover:text-sky-500 hover:bg-slate-50 transition-colors"
                      >
                        <Plus size={10} />
                        <span>새 하위폴더</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </nav>

        {/* 업로드 버튼 */}
        <div className="p-3 border-t border-slate-200 shrink-0">
          <button
            onClick={() => setShowUpload(v => !v)}
            className="w-full py-2 text-xs font-semibold text-white rounded-lg transition-all"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: '0 1px 6px rgba(14,165,233,0.28)',
            }}
          >
            + 문서 업로드
          </button>
        </div>
      </aside>

      {/* 오른쪽 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 업로드 패널 */}
        {showUpload && (
          <div className="p-5 border-b border-slate-200 bg-white shrink-0">
            <FileUpload onUploaded={() => { mutate(); setShowUpload(false); }} />
          </div>
        )}

        {/* 헤더 + 상태 필터 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{breadcrumb}</span>
            <ChevronRight size={13} className="text-slate-400" />
            <span className="text-slate-400 text-xs">{filteredDocs.length}건</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: '전체', value: null },
              { label: '인덱싱 완료', value: 'completed' },
              { label: '보호 문서', value: 'blocked' },
              { label: '처리 실패', value: 'failed' },
            ].map(tab => (
              <button
                key={String(tab.value)}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  statusFilter === tab.value
                    ? 'text-white border-sky-500'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-sky-300 hover:text-sky-600'
                }`}
                style={statusFilter === tab.value ? {
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  boxShadow: '0 1px 6px rgba(14,165,233,0.28)',
                } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 문서 테이블 */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-6 p-4 text-red-500 text-sm bg-red-50 rounded-xl border border-red-200">
              API 연결 실패. 백엔드를 확인하세요.
            </div>
          )}
          {!allDocs && !error && (
            <div className="p-6 text-slate-500 text-sm animate-pulse">로딩 중...</div>
          )}
          {allDocs && (
            <table className="w-full text-left border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className={thCls}>문서명</th>
                  <th className={thCls}>유형</th>
                  <th className={thCls}>형식</th>
                  <th className={thCls}>처리 상태</th>
                  <th className={thCls}>고객사</th>
                  <th className={thCls}>업로드</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400 text-sm">
                      업로드된 문서가 없습니다.
                    </td>
                  </tr>
                )}
                {filteredDocs.map(doc => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`cursor-pointer transition-colors group ${
                      selectedDoc?.id === doc.id
                        ? 'bg-sky-50 border-l-2 border-l-sky-400'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-xs">
                      <span className="line-clamp-2 leading-snug">{doc.title}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{doc.doc_type || '-'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                      {doc.file_format || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${STATUS_STYLE[doc.processing_status] ?? STATUS_STYLE['pending']}`}>
                        {STATUS_LABEL[doc.processing_status] ?? doc.processing_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{doc.customer_id || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMovingDoc(doc); }}
                          title="다른 폴더로 이동"
                          className="text-slate-400 hover:text-sky-500"
                        >
                          <FolderInput size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                          title="삭제"
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 문서 상세 패널 */}
      {selectedDoc && (
        <DocumentDetailPanel
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onRefineSuccess={() => mutate()}
        />
      )}

      {/* 문서 이동 모달 */}
      {movingDoc && (
        <MoveDocModal
          doc={movingDoc}
          customerOptions={allCustomerNames.filter(c => c !== '미분류')}
          onMove={handleMoveDoc}
          onClose={() => setMovingDoc(null)}
        />
      )}
    </div>
  );
}
