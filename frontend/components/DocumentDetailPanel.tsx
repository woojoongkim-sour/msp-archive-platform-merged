'use client';

import { apiFetch } from '@/lib/apiFetch';

import { useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';


export interface DocumentItem {
  id: string;
  title: string;
  file_format: string | null;
  processing_status: string;
  indexing_status: string;
  protection_type: string;
  customer_id: string | null;
  doc_type: string | null;
  owner: string | null;
  created_at: string;
  processing_error_reason?: string | null;
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

interface DocumentDetailPanelProps {
  doc: DocumentItem | null;
  onClose: () => void;
  onRefineSuccess?: () => void;
}

export default function DocumentDetailPanel({ doc, onClose, onRefineSuccess }: DocumentDetailPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!doc) return null;

  const canUploadRefinement =
    doc.processing_status === 'blocked' || doc.processing_status === 'awaiting_manual_refinement';

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !doc) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await apiFetch(`/api/v1/documents/${doc.id}/refine`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadResult('success');
        setSelectedFile(null);
        onRefineSuccess?.();
      } else {
        setUploadResult('error');
      }
    } catch {
      setUploadResult('error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-300 z-50 overflow-y-auto p-6 flex flex-col gap-6"
        style={{boxShadow: '-4px 0 32px rgba(0,0,0,0.10)'}}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 leading-snug break-words">{doc.title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <section className="space-y-2.5">
          {[
            ['처리 상태', null],
            ['보호 유형', doc.protection_type === 'none' ? '일반' : doc.protection_type],
            ['고객사', doc.customer_id || '-'],
            ['형식', (doc.file_format || '-').toUpperCase()],
            ['업로드', new Date(doc.created_at).toLocaleString('ko-KR')],
          ].map(([k, v]) => (
            <div key={k as string} className="flex items-start gap-3">
              <span className="text-xs text-slate-500 font-medium w-20 shrink-0 pt-0.5">{k}</span>
              {k === '처리 상태' ? (
                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${STATUS_STYLE[doc.processing_status] ?? STATUS_STYLE['pending']}`}>
                  {STATUS_LABEL[doc.processing_status] ?? doc.processing_status.toUpperCase()}
                </span>
              ) : (
                <span className="text-sm text-slate-700">{v as string}</span>
              )}
            </div>
          ))}
          {doc.processing_error_reason && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-500 font-medium w-20 shrink-0 pt-0.5">오류</span>
              <span className="text-sm text-red-500 break-words">{doc.processing_error_reason}</span>
            </div>
          )}
        </section>

        <section>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">처리 이력</p>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-300">
            <p className="text-sm text-slate-500">처리 이력 API가 준비 중입니다.</p>
          </div>
        </section>

        {canUploadRefinement && (
          <section>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">정제본 업로드</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all"
              style={dragOver ? {
                borderColor: '#0ea5e9',
                background: 'rgba(14,165,233,0.05)',
                boxShadow: '0 0 0 3px rgba(14,165,233,0.18)',
              } : {
                borderColor: '#e2e8f0',
                background: '#f8fafc',
              }}
            >
              <Upload className="w-7 h-7 mx-auto mb-2 text-slate-500" />
              {selectedFile ? (
                <p className="text-sm text-sky-600 font-semibold">{selectedFile.name}</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500">드래그 또는 클릭으로 파일 선택</p>
                  <p className="text-xs text-slate-500 mt-0.5">txt, md 파일 지원</p>
                </>
              )}
              <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFileChange} />
            </div>

            {selectedFile && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-3 w-full py-2.5 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  boxShadow: '0 2px 8px rgba(14,165,233,0.30)',
                }}
              >
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            )}

            {uploadResult === 'success' && <p className="mt-2 text-sm text-emerald-600 text-center">업로드가 완료됐습니다.</p>}
            {uploadResult === 'error' && <p className="mt-2 text-sm text-red-500 text-center">업로드에 실패했습니다.</p>}
          </section>
        )}
      </div>
    </>
  );
}
