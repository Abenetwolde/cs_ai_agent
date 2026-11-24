import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUp, AudioLines, Bot, Check, ChevronDown, CircleHelp, Headphones, LifeBuoy, LogOut, Mic, Plus, RotateCcw, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'
import { AdminPortal } from './admin'
import './style.css'

type Language = 'en' | 'am' | 'om' | 'ti'
type Profile = { id: string; full_name: string; email?: string | null; phone?: string | null; preferred_language: Language }
type SessionSummary = { id: string; status: string; summary?: string | null; updated_at: string }
type SupportMessage = { id?: number; role: 'user' | 'assistant'; content: string; created_at?: string; sources?: string[]; tools?: Array<{ tool: string; result: Record<string, any> }> }
const languages: Record<Language, string> = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo', ti: 'ትግርኛ' }
const parseSaved = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null } catch { return null } }
const normalizeText = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value) ?? String(value)
const normalizeMessage = (message: any): SupportMessage => ({ id: message.id, role: message.role === 'user' ? 'user' : 'assistant', content: normalizeText(message.content), created_at: message.created_at, sources: message.metadata?.sources || [], tools: message.metadata?.tools || [] })
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'An unexpected error occurred.'

function App() {
  const [profile, setProfile] = useState<Profile | null>(() => parseSaved<Profile>('addis-support-user'))
  const [sessions, setSessions] = useState<SessionSummary[]>([]), [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('addis-support-session'))
  const [messages, setMessages] = useState<SupportMessage[]>([]), [message, setMessage] = useState(''), [language, setLanguage] = useState<Language>(profile?.preferred_language || 'en')
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [handoff, setHandoff] = useState(false)
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState('')
  const [recording, setRecording] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null), recorder = useRef<MediaRecorder | null>(null), fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => { bottom.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [messages, busy])
  useEffect(() => {
    const userId = profile?.id
    if (!userId) return
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(`/api/users/${userId}/sessions`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Could not load your conversations.')
        if (cancelled) return
        const rows: SessionSummary[] = Array.isArray(data.sessions) ? data.sessions : []
        setSessions(rows)
        const savedId = localStorage.getItem('addis-support-session')
        const selected = rows.some(row => row.id === savedId) ? savedId : null
        if (selected) await loadSession(selected, userId)
        else { setSessionId(null); setMessages([]) }
      } catch (error) { if (!cancelled) setNotice(errorText(error)) }
    }
    load()
    return () => { cancelled = true }
  }, [profile?.id])

  async function loadSession(id: string, userId = profile?.id) {
    if (!id || !userId) return
    const response = await fetch(`/api/sessions/${id}?user_id=${encodeURIComponent(userId)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || 'Could not load this conversation.')
    setSessionId(id); localStorage.setItem('addis-support-session', id)
    setMessages(Array.isArray(data.messages) ? data.messages.filter((item: any) => item.role !== 'tool').map(normalizeMessage) : [])
    setHandoff(Boolean(data.handoff)); setNotice('')
  }

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: name, email: email || null, phone: phone || null, preferred_language: language }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not save your support profile.')
      localStorage.setItem('addis-support-user', JSON.stringify(data.user)); setProfile(data.user)
    } catch (error) { setNotice(errorText(error)) } finally { setBusy(false) }
  }

  async function newConversation() {
    setSessionId(null); localStorage.removeItem('addis-support-session'); setMessages([]); setHandoff(false); setNotice('')
  }

  async function send(value: string = message) {
    const text = value.trim()
    if (!text || busy || !profile?.id) return
    setMessage(''); setNotice(''); setBusy(true)
    setMessages(items => [...items, { role: 'user', content: text }])
    try {
      let activeSession: string | null = sessionId
      if (!activeSession) {
        const create = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: profile.id }) })
        const created = await create.json(); if (!create.ok) throw new Error(created.detail || 'Could not start a conversation.')
        const newSessionId: string = created.session_id
        activeSession = newSessionId; setSessionId(newSessionId); localStorage.setItem('addis-support-session', newSessionId)
      }
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: profile.id, session_id: activeSession, message: text, language }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Support is temporarily unavailable.')
      setMessages(items => [...items, { role: 'assistant', content: normalizeText(data.reply), sources: data.sources || [], tools: data.tool_results || [] }])
      setHandoff(Boolean(data.handoff))
      const history = await fetch(`/api/users/${profile.id}/sessions`).then(r => r.json()).catch(() => null)
      if (history?.sessions) setSessions(history.sessions)
    } catch (error) { setNotice(errorText(error)); setMessages(items => items.slice(0, -1)) }
    finally { setBusy(false) }
  }

  async function logout() {
    localStorage.removeItem('addis-support-user'); localStorage.removeItem('addis-support-session')
    setProfile(null); setSessionId(null); setMessages([]); setSessions([]); setHandoff(false); setNotice('')
  }

  async function transcribe(file?: File) {
    if (!file) return
    setNotice('Transcribing audio…')
    try {
      const form = new FormData(); form.append('audio', file)
      const response = await fetch('/api/transcribe', { method: 'POST', body: form }); const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Transcription failed.')
      setMessage(data.text || ''); setNotice('')
    } catch (error) { setNotice(errorText(error)) }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function recordVoice() {
    if (recording) { recorder.current?.stop(); setRecording(false); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream), chunks: Blob[] = []
      rec.ondataavailable = event => chunks.push(event.data)
      rec.onstop = () => { stream.getTracks().forEach(track => track.stop()); transcribe(new File(chunks, 'recording.webm', { type: chunks[0]?.type || 'audio/webm' })) }
      rec.start(); recorder.current = rec; setRecording(true)
    } catch { setNotice('Microphone access is unavailable. You can upload an audio file instead.') }
  }

  async function speak(text: string) {
    if (language === 'en') { setNotice('Addis Voices playback is available in Amharic, Afaan Oromo, and Tigrinya.'); return }
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Voice playback failed.')
      await new Audio(`data:${data.content_type};base64,${data.audio}`).play()
    } catch (error) { setNotice(errorText(error)) }
  }

  if (!profile) return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>Addis<span className="brand-light">AI</span></span><span className="brand-divider"/><span className="brand-product">Customer care</span></div></header><section className="login-wrap"><form className="login-card" onSubmit={register}><div className="welcome-icon"><Headphones size={22}/></div><div className="eyebrow">ADDIS AI CUSTOMER CARE</div><h1>Welcome. How can we help?</h1><p>Enter your support profile to start a chat and keep your conversation history together.</p><label>Your name<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="Full name"/></label><label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><div className="or-divider">or</div><label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+251 …"/></label><label>Preferred language<select value={language} onChange={e => setLanguage(e.target.value as Language)}>{Object.entries(languages).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>{notice && <div className="notice">{notice}</div>}<button className="login-submit" disabled={busy}>{busy ? 'Saving…' : 'Continue to support'}</button><small>Use the same email or phone next time to reopen your support profile.</small></form></section></main>

  return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>Addis<span className="brand-light">AI</span></span><span className="brand-divider"/><span className="brand-product">Customer care</span></div><div className="top-actions"><label className="language-select"><span>{languages[language]}</span><ChevronDown size={14}/><select aria-label="Language" value={language} onChange={e => setLanguage(e.target.value as Language)}>{Object.entries(languages).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className="icon-button reset-button" onClick={logout} title="Sign out"><LogOut size={16}/><span>Sign out</span></button><div className="avatar">{profile.full_name?.slice(0, 1)?.toUpperCase() || 'A'}</div></div></header>
    <section className="workspace"><aside className="sidebar"><div className="sidebar-title">YOUR SUPPORT <span className="tiny-dot"/></div><button className="new-chat-row" onClick={newConversation}><Plus size={16}/> New conversation</button><div className="session-list">{sessions.map(row => <button key={row.id} className={`session-item ${row.id === sessionId ? 'selected' : ''}`} onClick={() => loadSession(row.id).catch(error => setNotice(errorText(error)))}><span className="session-status"><i className={row.status === 'escalated' ? 'urgent' : ''}/></span><span><strong>{row.status === 'escalated' ? 'Escalated conversation' : 'Support conversation'}</strong><small>{new Date(row.updated_at).toLocaleDateString()} · {row.status}</small></span></button>)}</div><div className="sidebar-card"><div className="shield"><ShieldCheck size={18}/></div><strong>{profile.full_name}</strong><p>{profile.email || profile.phone}</p><div className="availability"><i/> Support assistant available</div></div><div className="sidebar-bottom"><span className="secure-icon"><ShieldCheck size={14}/></span><span>Your messages are saved to your profile</span></div></aside>
      <section className="chat-panel"><div className="chat-heading"><div className="chat-title"><div className="bot-badge"><Bot size={19}/></div><div><h1>Customer care</h1><div className="online"><i/> Addis AI multilingual support</div></div></div><div className="heading-actions"><button className="text-button" onClick={newConversation}><Plus size={15}/> New conversation</button></div></div>
      <div className="messages-area">{messages.length === 0 ? <div className="welcome"><div className="welcome-icon"><Sparkles size={22}/></div><div className="eyebrow">PERSONALIZED CUSTOMER CARE</div><h2>How can we help<br/>you today?</h2><p>Ask about orders, products, returns, or your account.<br/>Answers can include sources from company support documents.</p><div className="suggestions"><button onClick={() => send('Please check my order ADDIS-1001')}><span><ArrowUp size={15}/></span> Check my sample order</button><button onClick={() => send('What is the return and refund policy?')}><span><RotateCcw size={15}/></span> Returns & refunds</button><button onClick={() => send('I need help from a human support agent')}><span><CircleHelp size={15}/></span> Talk to support</button></div></div> : <div className="message-list"><div className="date-divider"><span>Conversation</span></div>{messages.map((msg, index) => <div key={msg.id || index} className={`message-row ${msg.role}`}><div className={msg.role === 'assistant' ? 'message-avatar' : 'user-avatar'}>{msg.role === 'assistant' ? <Bot size={16}/> : profile.full_name?.slice(0, 1)?.toUpperCase()}</div><div className="message-content"><div className="message-meta">{msg.role === 'assistant' ? 'Addis AI' : profile.full_name} <span>· {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</span></div><div className="bubble">{msg.content}{msg.tools?.map((entry, i) => <div className="tool-result" key={i}><div className="tool-label"><Check size={13}/> {entry.tool?.replaceAll('_', ' ').toUpperCase()}</div>{entry.result?.order_number && <strong>{entry.result.order_number}</strong>}{entry.result?.status && <span>Status: {entry.result.status}</span>}{entry.result?.estimated_delivery && <span>Estimated delivery: {entry.result.estimated_delivery}</span>}{entry.result?.ticket_id && <span>Ticket: {entry.result.ticket_id} · {entry.result.priority || 'high'} priority</span>}{entry.result?.found === false && <span>Order not found on this profile.</span>}</div>)}</div>{(msg.sources || []).length > 0 && <div className="citations"><span>Sources</span>{(msg.sources || []).map(source => <span className="source-badge" key={source}>{source}</span>)}</div>}{msg.role === 'assistant' && <button className="speak-button" onClick={() => speak(msg.content)} title="Listen"><Volume2 size={14}/></button>}</div></div>)}{busy && <div className="message-row assistant"><div className="message-avatar"><Bot size={16}/></div><div className="message-content"><div className="message-meta">Addis AI <span>· working</span></div><div className="bubble typing"><i/><i/><i/></div></div></div>}<div ref={bottom}/></div>}</div>
      {handoff && <div className="handoff-banner"><LifeBuoy size={16}/><span>A support ticket has been created for human follow-up.</span></div>}{notice && <div className="notice">{notice}</div>}
      <div className="composer-wrap"><div className="composer"><textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Write a message..." rows={1}/><div className="composer-tools"><div className="composer-left"><input ref={fileInput} hidden type="file" accept="audio/*" onChange={e => transcribe(e.target.files?.[0])}/><button className={`tool-button mic ${recording ? 'recording' : ''}`} title={recording ? 'Stop recording' : 'Record voice message'} onClick={recordVoice}><Mic size={16}/></button><button className="tool-button attach" title="Upload audio" onClick={() => fileInput.current?.click()}><AudioLines size={16}/></button><span className="composer-hint">Replies use approved support information</span></div><button className={`send-button ${message.trim() && !busy ? 'ready' : ''}`} disabled={!message.trim() || busy} onClick={() => send()} title="Send message"><ArrowUp size={17}/></button></div></div><div className="composer-foot">Powered by <span>Addis AI</span><span className="foot-separator">·</span> Support for <span>Amharic, Afaan Oromo, Tigrinya & English</span></div></div>
    </section></section>
  </main>
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing app root element.')
createRoot(rootElement).render(location.pathname.startsWith('/admin') ? <AdminPortal/> : <App />)
