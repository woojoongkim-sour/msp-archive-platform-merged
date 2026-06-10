import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from '@/components/layout/AppShell';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MSP Archive Platform",
  description: "AI-powered knowledge archive for MSP engineers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.className} h-screen w-full overflow-hidden flex flex-col bg-slate-100 text-slate-900 font-sans antialiased`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
