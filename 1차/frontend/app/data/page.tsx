import FileUpload from '@/components/FileUpload';
import SyncedSourcesTable from '@/components/SyncedSourcesTable';

export default function DataManagementPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">문서 및 데이터 관리</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">운영 환경 문서를 업로드하고 벡터화 상태를 관리합니다.</p>
      </header>
      
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">새 문서 업로드</h2>
        <FileUpload />
      </section>

      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">문서 동기화 상태 (Vector DB)</h2>
        <SyncedSourcesTable />
      </section>
    </div>
  );
}