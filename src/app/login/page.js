'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState('/');
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const next = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next') || '/'
        : '/';
      setNextPath(next);

      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await parseJsonSafe(res);
        if (data?.user) {
          router.replace(next);
          return;
        }
      } catch {}
      setChecking(false);
    };

    checkSession();
  }, [router]);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const runAuthRequest = () => fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      let res = await runAuthRequest();
      if (res.status === 502 || res.status === 504) {
        await wait(600);
        res = await runAuthRequest();
      }

      if (!res.ok) {
        const payload = await parseJsonSafe(res);
        throw new Error(payload.error || `Authentication failed (HTTP ${res.status})`);
      }

      const data = await parseJsonSafe(res);
      if (!data?.user) {
        throw new Error('Authentication failed');
      }

      router.replace(nextPath);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="login-wrap">
        <div className="glass-panel login-card">
          <p className="muted">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="glass-panel login-card">
        <h1 className="hero-title">
          Academic <span className="gradient-text">Suite</span>
        </h1>
        <p className="muted">Sign in to access the dashboard and all features.</p>

        <div className="mode-row">
          <button
            type="button"
            className={`mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
            disabled={loading}
          >
            Login
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
            disabled={loading}
          >
            Register
          </button>
        </div>

        <div className="form-grid">
          <input
            className="field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Password (minimum 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="btn-primary submit-btn" type="button" onClick={submit} disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}
      </div>

      <style jsx>{`
        .login-wrap {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 1.5rem;
        }
        .login-card {
          width: 100%;
          max-width: 520px;
          padding: 2rem;
        }
        .muted {
          color: var(--text-secondary);
          margin-bottom: 1rem;
        }
        .mode-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .mode-btn {
          border: 1px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 12px;
          padding: 0.8rem;
          cursor: pointer;
          font: inherit;
          font-weight: 600;
        }
        .mode-btn.active {
          border-color: rgba(0, 255, 163, 0.35);
          color: var(--accent-primary);
          background: rgba(0, 255, 163, 0.1);
        }
        .form-grid {
          display: grid;
          gap: 0.75rem;
        }
        .field {
          width: 100%;
          border: 1px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 12px;
          padding: 0.85rem 0.95rem;
          outline: none;
          font: inherit;
        }
        .submit-btn {
          margin-top: 0.25rem;
        }
        .submit-btn:disabled,
        .mode-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
