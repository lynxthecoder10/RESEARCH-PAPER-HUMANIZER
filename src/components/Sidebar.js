'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function Sidebar() {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: '🏠' },
    { name: 'Paper Gen', path: '/generate', icon: '📝' },
    { name: 'Humanizer', path: '/humanize', icon: '✨' },
    { name: 'History', path: '/history', icon: '📜' },
  ];

  return (
    <aside className="sidebar reveal-1">
      <div className="sidebar-logo">
        <div className="logo-icon-wrapper">
          <img 
            src="/academic-logo.png" 
            alt="Logo" 
            className="logo-icon"
            onError={(e) => { e.target.src = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"; }}
          />
        </div>
        <div className="logo-text">Academic<br/><span className="gradient-text">Suite</span></div>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator"></div>
        <span>SYSTEM OPTIMIZED</span>
      </div>

      <style jsx>{`
        .logo-icon-wrapper {
          background: rgba(255, 255, 255, 0.03);
          padding: 8px;
          border-radius: 12px;
          border: 1px solid var(--glass-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sidebar-footer {
          margin-top: auto;
          padding: 2rem;
          border-top: 1px solid var(--glass-border);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-secondary);
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 1px;
        }
        .status-indicator {
          width: 6px;
          height: 6px;
          background: var(--accent-primary);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-primary);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </aside>
  );
}
