export default function StatusBar() {
  return (
    <footer className="h-8 bg-white text-slate-500 text-xs flex items-center px-6 border-t border-slate-300 shrink-0" style={{boxShadow: '0 -1px 4px rgba(0,0,0,0.04)'}}>
      <div className="flex items-center gap-4 w-full">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{boxShadow: '0 0 6px rgba(52,211,153,0.6)'}} />
          시스템 상태: 정상
        </span>
        <span className="text-slate-300">|</span>
        <span>작업 진행률: 대기 중</span>
      </div>
    </footer>
  );
}
