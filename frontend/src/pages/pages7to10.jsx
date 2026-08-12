import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('cgto_token')}` });
const authJ = () => ({ ...authH(), 'Content-Type': 'application/json' });

// ── COMMUNITY KNOWLEDGE — Page 7 ─────────────────────────────────────────
export function CommunityKnowledge() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [posts, setPosts]     = useState([]);
  const [drills, setDrills]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('community');
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, dRes] = await Promise.all([
        fetch(`${API_BASE}/community-knowledge`, { headers: authH() }),
        fetch(`${API_BASE}/community-knowledge/drills`,            { headers: authH() }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setPosts(Array.isArray(d) ? d : (d.posts ?? [])); }
      if (dRes.ok) { const d = await dRes.json(); setDrills(Array.isArray(d) ? d : (d.drills ?? [])); }
    } catch (err) { addToast({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submitPost = async () => {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/community-knowledge`, {
        method: 'POST', headers: authJ(), body: JSON.stringify({ content: newPost }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setNewPost(''); addToast({ type: 'success', message: 'Post shared' }); fetchAll();
    } catch (err) { addToast({ type: 'error', message: `Could not post: ${err.message}` }); }
    finally { setPosting(false); }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="community" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Community</h1>
          <FrameworkBadge name="Fearless Futures™ Tennis" size="xs" />
        </header>
        {loading && <LoadingOverlay message="Loading community…" />}
        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
              {[{ key: 'community', label: 'Knowledge hub' }, { key: 'drills', label: 'Drill library' }].map(t => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'community' && (
              <>
                <div className="mb-4 flex gap-2">
                  <textarea value={newPost} onChange={e => setNewPost(e.target.value)} rows={2}
                    placeholder="Share something with the community…"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                    aria-label="New post" />
                  <button type="button" onClick={submitPost} disabled={posting || !newPost.trim()}
                    className="self-end rounded-lg bg-[--primary-green] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                    {posting ? '…' : 'Post'}
                  </button>
                </div>
                <div className="space-y-3">
                  {posts.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-8">No posts yet.</p>
                    : posts.map(p => (
                      <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-sm text-gray-700">{p.content}</p>
                        <p className="mt-1 text-xs text-gray-400">{p.author_name ?? 'Coach'} · {p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : ''}</p>
                      </div>
                    ))
                  }
                </div>
              </>
            )}
            {tab === 'drills' && (
              <div className="space-y-3">
                {drills.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-8">No drills in the library yet.</p>
                  : drills.map(d => (
                    <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{d.name ?? d.title}</p>
                          {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
                        </div>
                        {d.difficulty && (
                          <span className="rounded-full bg-[--primary-green]/10 px-2 py-0.5 text-[10px] font-semibold text-[--primary-green] shrink-0">{d.difficulty}</span>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="community" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}

// ── SAFETY CHECKLISTS — Page 8 ────────────────────────────────────────────
export function SafetyChecklists() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeList, setActiveList] = useState(null);
  const [checked, setChecked]       = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/checklists`, { headers: authH() });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setChecklists(Array.isArray(d) ? d : (d.checklists ?? []));
    } catch (err) { addToast({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openChecklist = (cl) => {
    setActiveList(cl);
    const initial = {};
    (cl.items ?? []).forEach((_, i) => { initial[i] = false; });
    setChecked(initial);
  };

  const allChecked = activeList && Object.values(checked).length > 0 && Object.values(checked).every(Boolean);

  const submitChecklist = async () => {
    if (!activeList) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/checklists/${activeList.id}/complete`, {
        method: 'POST', headers: authJ(),
        body: JSON.stringify({ completed_items: checked, completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      addToast({ type: 'success', message: `${activeList.title} submitted` });
      setActiveList(null);
    } catch (err) { addToast({ type: 'error', message: `Submit failed: ${err.message}` }); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="checklists" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">{activeList ? activeList.title : 'Safety Checklists'}</h1>
          {activeList && (
            <button type="button" onClick={() => setActiveList(null)} className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">← Back</button>
          )}
        </header>
        {loading && <LoadingOverlay message="Loading checklists…" />}
        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">
            {!activeList ? (
              <div className="space-y-3">
                {checklists.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-8">No checklists configured yet.</p>
                  : checklists.map(cl => (
                    <button key={cl.id} type="button" onClick={() => openChecklist(cl)}
                      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{cl.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{(cl.items ?? []).length} items</p>
                        </div>
                        <span className="text-[--primary-green] text-sm">→</span>
                      </div>
                    </button>
                  ))
                }
              </div>
            ) : (
              <div className="max-w-md space-y-3">
                {(activeList.items ?? []).map((item, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={!!checked[i]} onChange={e => setChecked(c => ({ ...c, [i]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[--primary-green]" />
                    <span className={`text-sm ${checked[i] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {typeof item === 'string' ? item : (item.label ?? item.text ?? JSON.stringify(item))}
                    </span>
                  </label>
                ))}
                <button type="button" onClick={submitChecklist} disabled={!allChecked || submitting}
                  className="w-full rounded-lg bg-[--primary-green] py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green] mt-2">
                  {submitting ? 'Submitting…' : allChecked ? 'Submit checklist ✓' : `Complete all ${(activeList.items ?? []).length} items to submit`}
                </button>
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="checklists" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}

// ── ALERTS & NOTIFICATIONS — Page 9 ──────────────────────────────────────
const SEVERITY = {
  low:    { cls: 'border-l-gray-300 bg-white',          dot: 'bg-gray-400'  },
  medium: { cls: 'border-l-blue-300 bg-blue-50/30',     dot: 'bg-blue-400'  },
  high:   { cls: 'border-l-orange-400 bg-orange-50/30', dot: 'bg-orange-400'},
  urgent: { cls: 'border-l-red-500 bg-red-50/40',       dot: 'bg-red-500'   },
};

export function AlertsNotifications() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('unread');

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API_BASE}/alerts${filter === 'unread' ? '?status=unread' : ''}`;
      const res = await fetch(url, { headers: authH() });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setAlerts(Array.isArray(d) ? d : (d.alerts ?? []));
    } catch (err) { addToast({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const markRead = async (id) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}/read`, { method: 'PATCH', headers: authH() });
      setAlerts(a => a.map(x => x.id === id ? { ...x, is_read: true } : x));
    } catch {}
  };

  const dismiss = async (id) => {
    try {
      // alert dismiss not yet in backend
      setAlerts(a => a.filter(x => x.id !== id));
    } catch {}
  };

  const markAllRead = async () => {
    await Promise.allSettled(alerts.filter(a => !a.is_read).map(a =>
      fetch(`${API_BASE}/alerts/${a.id}/read`, { method: 'PATCH', headers: authH() })
    ));
    setAlerts(a => a.map(x => ({ ...x, is_read: true })));
    addToast({ type: 'success', message: 'All marked as read' });
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="alerts" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Alerts</h1>
          {unreadCount > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>}
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Mark all read</button>
          )}
        </header>
        {loading && <LoadingOverlay message="Loading alerts…" />}
        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
              {[{ key: 'unread', label: 'Unread' }, { key: 'all', label: 'All' }].map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${filter === f.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">
                {filter === 'unread' ? "No unread alerts — you're all caught up." : 'No alerts.'}
              </p>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => {
                  const sev = SEVERITY[a.severity] ?? SEVERITY.medium;
                  return (
                    <div key={a.id} className={`rounded-xl border-l-4 p-4 transition-opacity ${sev.cls} ${a.is_read ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${a.is_read ? 'text-gray-500' : 'font-semibold text-gray-800'}`}>{a.message}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {a.alert_type?.replace(/_/g, ' ')} · {a.created_at ? new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!a.is_read && (
                            <button type="button" onClick={() => markRead(a.id)}
                              className="rounded p-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
                              aria-label="Mark as read">✓</button>
                          )}
                          <button type="button" onClick={() => dismiss(a.id)}
                            className="rounded p-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            aria-label="Dismiss">✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="alerts" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}

// ── AI ASSISTANT — Page 10 ────────────────────────────────────────────────
export function AIAssistant() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi — I\'m Coach Caroline G, your CG Tennis OS™ coaching intelligence engine. Ask me anything about your players, sessions, or coaching strategy. Remember: Joy is the Advantage.' },
  ]);
  const [input, setInput]     = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = React.useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || thinking) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setThinking(true);
    try {
      const res = await fetch(`${API_BASE}/ai-assist/query`, {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.response ?? data.message ?? 'No response.' }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, I could not reach Coach Caroline G: ${err.message}` }]);
    } finally { setThinking(false); }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="ai-assistant" />
      <div className="flex flex-1 flex-col" style={{ height: '100dvh' }}>
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shrink-0">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Coach Caroline G</h1>
          <FrameworkBadge name="Apex Domain Engine™" size="xs" />
          <FrameworkBadge name="TennisNLP™" size="xs" />
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${m.role === 'user' ? 'bg-[--primary-green] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-400 animate-pulse">Thinking…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white p-3 flex gap-2">
          <input type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about your players, sessions, or strategy…"
            disabled={thinking}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green] disabled:opacity-50"
            aria-label="Message input" />
          <button type="button" onClick={sendMessage} disabled={!input.trim() || thinking}
            className="rounded-xl bg-[--primary-green] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
            aria-label="Send message">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}