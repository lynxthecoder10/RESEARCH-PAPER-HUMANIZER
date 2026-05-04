'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
        <div className="logo-mark"><span></span></div>
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
              style={{
                background: isActive ? 'rgba(0, 255, 163, 0.08)' : 'transparent',
                borderColor: isActive ? 'rgba(0, 255, 163, 0.2)' : 'transparent',
                boxShadow: isActive ? '0 0 15px rgba(0, 255, 163, 0.1)' : 'none',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '20%', bottom: '20%', 
                  width: '3px', background: 'var(--accent-primary)', borderRadius: '0 4px 4px 0',
                  boxShadow: '0 0 10px var(--accent-primary)'
                }} />
              )}
              <span className="nav-icon" style={{ 
                fontSize: '1.2rem', 
                opacity: isActive ? 1 : 0.6,
                filter: isActive ? 'drop-shadow(0 0 5px var(--accent-primary))' : 'none'
              }}>
                {item.icon}
              </span>
              <span className="nav-text" style={{ 
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'white' : 'var(--text-secondary)'
              }}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator"></div>
        <span style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>SYSTEM OPTIMIZED</span>
      </div>

      <style jsx>{`
        .sidebar-footer {
          margin-top: auto;
          padding: 1.5rem;
          border-top: 1px solid var(--glass-border);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-secondary);
        }
        .status-indicator {
          width: 8px;
          height: 8px;
          background: var(--accent-primary);
          border-radius: 50%;
          box-shadow: 0 0 12px var(--accent-primary);
          animation: glow 2s ease-in-out infinite;
        }
        @keyframes glow {
          0%, 100% { opacity: 0.5; box-shadow: 0 0 5px var(--accent-primary); }
          50% { opacity: 1; box-shadow: 0 0 15px var(--accent-primary); }
        }
      `}</style>
    </aside>
  );
}
