'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <div className="flex flex-1 overflow-hidden h-full">
        <Sidebar />
        <main className="flex-1 bg-slate-100 overflow-y-auto relative h-full flex flex-col">
          {children}
        </main>
      </div>
      <StatusBar />
    </>
  );
}
