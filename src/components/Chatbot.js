'use client';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your Academic Assistant. How can I help with your research today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages.slice(-5) })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
      } else {
        throw new Error(data.message || 'Failed to respond');
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm currently recalibrating. Please try asking again in a moment." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chatbot-wrapper" style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 1000 }}>
      {isOpen ? (
        <div className="chat-window glass-panel reveal-4" style={{ 
          width: '380px', height: '500px', display: 'flex', flexDirection: 'column',
          padding: '0', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {/* Header */}
          <div style={{ 
            padding: '1.25rem', background: 'rgba(255,255,255,0.05)', 
            borderBottom: '1px solid var(--glass-border)', display: 'flex', 
            justifyContent: 'space-between', alignItems: 'center' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="status-dot"></div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Academic Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '0.8rem 1rem', borderRadius: '14px',
                background: msg.role === 'user' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? 'black' : 'white',
                fontSize: '0.9rem', lineHeight: '1.5',
                border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)'
              }}>
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div style={{ alignSelf: 'flex-start', padding: '0.8rem 1rem', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '0.75rem' }}>
            <input 
              type="text" 
              placeholder="Ask anything..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              style={{ 
                flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', 
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                color: 'white', fontSize: '0.9rem', outline: 'none'
              }}
            />
            <button onClick={handleSend} disabled={isLoading} style={{ 
              padding: '0.75rem', borderRadius: '10px', background: 'var(--accent-primary)',
              border: 'none', color: 'black', fontWeight: 700, cursor: 'pointer'
            }}>
              →
            </button>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="chat-toggle reveal-4"
          style={{ 
            width: '64px', height: '64px', borderRadius: '50%', 
            background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', 
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', padding: '0'
          }}
        >
          <Image
            src="/logo.png" 
            alt="AI" 
            width={64}
            height={64}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        </button>
      )}

      <style jsx>{`
        .status-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-primary);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-primary);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        .chat-toggle:hover {
          transform: scale(1.1) rotate(5deg);
          border-color: var(--accent-primary);
          box-shadow: 0 0 20px var(--accent-glow);
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      `}</style>
    </div>
  );
}
