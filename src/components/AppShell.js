'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Chatbot from '@/components/Chatbot';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <main className="main-viewport" style={{ marginLeft: 0, width: '100%', minHeight: '100vh' }}>
        <div className="background-mesh"></div>
        <div className="noise-overlay"></div>
        {children}
      </main>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-viewport">
        <div className="background-mesh"></div>
        <div className="noise-overlay"></div>
        {children}
        <Chatbot />
      </main>
    </div>
  );
}
