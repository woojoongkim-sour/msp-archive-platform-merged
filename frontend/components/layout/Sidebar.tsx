'use client';

import { MessageSquare, Search, FileText, Mail, AlertTriangle, GitBranch, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { href: '/',          icon: MessageSquare, label: '채팅' },
  { href: '/search',    icon: Search,        label: '검색' },
  { href: '/documents', icon: FileText,      label: '문서' },
  { href: '/email',     icon: Mail,          label: '이메일' },
];

const OP_ITEMS = [
  { href: '/events', icon: AlertTriangle, label: '이벤트' },
];

const KNOW_ITEMS = [
  { href: '/graph', icon: GitBranch, label: '관계 탐색' },
  { href: '/admin', icon: Settings,  label: '관리자' },
];

function NavLink({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 mx-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-sky-100 text-sky-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
      style={active ? {
        boxShadow: 'inset 3px 0 0 -1px #0ea5e9, 0 0 12px rgba(14,165,233,0.08)',
        borderLeft: '3px solid #0ea5e9',
      } : { borderLeft: '3px solid transparent' }}
    >
      <Icon
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-sky-500' : 'text-slate-500'}`}
        size={18}
      />
      <span>{label}</span>
      {active && (
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400"
          style={{ boxShadow: '0 0 6px rgba(14,165,233,0.6)' }}
        />
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-6 pt-5 pb-1.5">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <aside
      className="w-60 bg-white flex flex-col shrink-0 h-full border-r border-slate-300"
      style={{ boxShadow: '2px 0 16px rgba(0,0,0,0.04)' }}
    >
      <nav className="flex-1 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}

        <SectionLabel label="Operations" />
        {OP_ITEMS.map(item => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}

        <SectionLabel label="Knowledge" />
        {KNOW_ITEMS.filter(item => item.href !== '/admin' || isAdmin).map(item => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="text-[10px] text-slate-500 text-center">v0.1.0 · MSP Archive Platform</div>
      </div>
    </aside>
  );
}
