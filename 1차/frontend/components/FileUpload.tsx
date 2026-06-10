"use client";

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';


type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function FileUpload({ onUploaded }: { onUploaded?: () => void }) {
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    setState('uploading');
    setMessage(`"${file.name}" 업로드 중...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch(`/api/v1/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (res.status === 202) {
        setState('success');
        setMessage(`"${result.filename}" 업로드 완료. 백그라운드에서 처리 중입니다.`);
        onUploaded?.();
      } else {
        throw new Error(result.detail || '업로드 실패');
      }
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? `오류: ${err.message}` : '알 수 없는 오류가 발생했습니다.');
    }
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  const getStyle = () => {
    if (isDragActive) return {
      borderColor: '#0ea5e9',
      background: 'linear-gradient(135deg, rgba(14,165,233,0.06) 0%, rgba(56,189,248,0.04) 100%)',
      boxShadow: '0 0 0 3px rgba(14,165,233,0.2), 0 4px 20px rgba(14,165,233,0.12)',
    };
    if (state === 'success') return {
      borderColor: '#34d399',
      background: 'rgba(52,211,153,0.04)',
      boxShadow: '0 0 0 2px rgba(52,211,153,0.15)',
    };
    if (state === 'error') return {
      borderColor: '#f87171',
      background: 'rgba(248,113,113,0.04)',
      boxShadow: '0 0 0 2px rgba(248,113,113,0.15)',
    };
    return {
      borderColor: '#e2e8f0',
      background: '#ffffff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    };
  };

  return (
    <div
      {...getRootProps()}
      className="w-full p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-200"
      style={getStyle()}
    >
      <input {...getInputProps()} />
      <div className="space-y-3">
        {isDragActive ? (
          <>
            <div className="flex justify-center">
              <Upload className="w-10 h-10 text-sky-500" />
            </div>
            <p className="text-sky-600 font-semibold">여기에 파일을 놓으세요!</p>
          </>
        ) : state === 'success' ? (
          <>
            <div className="flex justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
          </>
        ) : state === 'error' ? (
          <>
            <div className="flex justify-center">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(56,189,248,0.08) 100%)',
                  boxShadow: '0 0 0 1px rgba(14,165,233,0.15)',
                }}
              >
                <Upload className="w-5 h-5 text-sky-500" />
              </div>
            </div>
            <p className="text-slate-800 font-medium text-sm">
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-xs text-slate-500">PDF, DOCX, XLSX 지원</p>
          </>
        )}
        {message && (
          <p className={`text-xs font-medium leading-relaxed ${
            state === 'success' ? 'text-emerald-600' :
            state === 'error'   ? 'text-red-500' :
                                  'text-slate-500'
          }`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
