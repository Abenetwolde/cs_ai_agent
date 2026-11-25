import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Headphones,
  LifeBuoy,
  LogOut,
  Mic,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  X
} from 'lucide-react'
import { Language, Profile, SessionSummary, SupportMessage } from './types'

const languages: Record<Language, string> = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo', ti: 'ትግርኛ' }
const normalizeText = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value) ?? String(value)
const normalizeMessage = (message: any): SupportMessage => ({
  id: message.id,
  role: message.role === 'user' ? 'user' : 'assistant',
  content: normalizeText(message.content),
  created_at: message.created_at,
  sources: message.metadata?.sources || [],
  tools: message.metadata?.tools || []
})
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'An unexpected error occurred.'

interface ChatProps {
  profile: Profile | null
  setProfile: (p: Profile | null) => void
  language: Language
  setLanguage: (lang: Language) => void
  initialPrompt?: string
  onClose?: () => void
  isFloating?: boolean
}

export function ChatWidget({ profile, setProfile, language, setLanguage, initialPrompt, onClose, isFloating }: ChatProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('addis-support-session'))
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [handoff, setHandoff] = useState(false)
  const [recording, setRecording] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // Auth form states if profile is null
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')

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

  // Handle auto-sending initialPrompt if provided
  useEffect(() => {
    if (initialPrompt && profile?.id && !busy) {
      send(initialPrompt)
    }
  }, [initialPrompt, profile?.id])

  async function loadSession(id: string, userId = profile?.id) {
    if (!id || !userId) return
    const response = await fetch(`/api/sessions/${id}?user_id=${encodeURIComponent(userId)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || 'Could not load this conversation.')
    setSessionId(id)
    localStorage.setItem('addis-support-session', id)
    setMessages(Array.isArray(data.messages) ? data.messages.filter((item: any) => item.role !== 'tool').map(normalizeMessage) : [])
    setHandoff(Boolean(data.handoff))
    setNotice('')
  }

  async function registerProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: regName, email: regEmail || null, phone: regPhone || null, preferred_language: language })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not save your support profile.')
      localStorage.setItem('addis-support-user', JSON.stringify(data.user))
      setProfile(data.user)
    } catch (error) { setNotice(errorText(error)) } finally { setBusy(false) }
  }

  async function newConversation() {
    setSessionId(null)
    localStorage.removeItem('addis-support-session')
    setMessages([])
    setHandoff(false)
    setNotice('')
  }

  async function send(value: string = message) {
    const text = value.trim()
    if (!text || busy || !profile?.id) return
    setMessage('')
    setNotice('')
    setBusy(true)
    setMessages(items => [...items, { role: 'user', content: text }])
    try {
      let activeSession: string | null = sessionId
      if (!activeSession) {
        const create = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: profile.id })
        })
        const created = await create.json()
        if (!create.ok) throw new Error(created.detail || 'Could not start a conversation.')
        const newSessionId: string = created.session_id
        activeSession = newSessionId
        setSessionId(newSessionId)
        localStorage.setItem('addis-support-session', newSessionId)
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, session_id: activeSession, message: text, language })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Support is temporarily unavailable.')
      setMessages(items => [...items, { role: 'assistant', content: normalizeText(data.reply), sources: data.sources || [], tools: data.tool_results || [] }])
      setHandoff(Boolean(data.handoff))
      const history = await fetch(`/api/users/${profile.id}/sessions`).then(r => r.json()).catch(() => null)
      if (history?.sessions) setSessions(history.sessions)
    } catch (error) {
      setNotice(errorText(error))
      setMessages(items => items.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }

  async function transcribe(file?: File) {
    if (!file) return
    setNotice('Transcribing audio…')
    try {
      const form = new FormData()
      form.append('audio', file)
      const response = await fetch('/api/transcribe', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Transcription failed.')
      setMessage(data.text || '')
      setNotice('')
    } catch (error) { setNotice(errorText(error)) }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function recordVoice() {
    if (recording) { recorder.current?.stop(); setRecording(false); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = event => chunks.push(event.data)
      rec.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        transcribe(new File(chunks, 'recording.webm', { type: chunks[0]?.type || 'audio/webm' }))
      }
      rec.start()
      recorder.current = rec
      setRecording(true)
    } catch {
      setNotice('Microphone access is unavailable. You can upload an audio file instead.')
    }
  }

  async function speak(text: string) {
    if (language === 'en') {
      setNotice('Addis Voices playback is available in Amharic, Afaan Oromo, and Tigrinya.')
      return
    }
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Voice playback failed.')
      await new Audio(`data:${data.content_type};base64,${data.audio}`).play()
    } catch (error) { setNotice(errorText(error)) }
  }

  if (!profile) {
    return (
      <div className={`ai-auth-box ${isFloating ? 'floating-card' : ''}`}>
        {onClose && (
          <button className="chat-close-btn" onClick={onClose} title="Close Assistant">
            <X size={18} />
          </button>
        )}
        <form className="login-card compact-login" onSubmit={registerProfile}>
          <div className="welcome-icon"><Headphones size={22} /></div>
          <div className="eyebrow">ADDIS AI CUSTOMER CARE</div>
          <h2>Sign in for AI Support</h2>
          <p>Register or enter your contact to check order status and interact with Addis AI.</p>
          <label>Your full name
            <input required maxLength={160} value={regName} onChange={e => setRegName(e.target.value)} placeholder="e.g. Dawit Bekele" />
          </label>
          <label>Email address
            <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <div className="or-divider">or</div>
          <label>Phone number
            <input value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+251 91 …" />
          </label>
          <label>Preferred language
            <select value={language} onChange={e => setLanguage(e.target.value as Language)}>
              {Object.entries(languages).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          {notice && <div className="notice">{notice}</div>}
          <button className="login-submit" disabled={busy}>{busy ? 'Connecting…' : 'Continue to AI Assistant'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className={`chat-container-layout ${isFloating ? 'floating-chat' : 'full-chat'}`}>
      {!isFloating && (
        <aside className="sidebar">
          <div className="sidebar-title">CONVERSATIONS <span className="tiny-dot" /></div>
          <button className="new-chat-row" onClick={newConversation}>
            <Plus size={16} /> New conversation
          </button>
          <div className="session-list">
            {sessions.map(row => (
              <button
                key={row.id}
                className={`session-item ${row.id === sessionId ? 'selected' : ''}`}
                onClick={() => loadSession(row.id).catch(error => setNotice(errorText(error)))}
              >
                <span className="session-status"><i className={row.status === 'escalated' ? 'urgent' : ''} /></span>
                <span>
                  <strong>{row.status === 'escalated' ? 'Escalated discussion' : 'Support inquiry'}</strong>
                  <small>{new Date(row.updated_at).toLocaleDateString()} · {row.status}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="sidebar-card">
            <div className="shield"><ShieldCheck size={18} /></div>
            <strong>{profile.full_name}</strong>
            <p>{profile.email || profile.phone}</p>
            <div className="availability"><i /> Multilingual AI Assistant Active</div>
          </div>
        </aside>
      )}

      <section className="chat-panel">
        <div className="chat-heading">
          <div className="chat-title">
            <div className="bot-badge"><Bot size={19} /></div>
            <div>
              <h1>Addis AI Customer Care</h1>
              <div className="online"><i /> Multilingual Assistant (Amharic, Oromo, Tigrinya, English)</div>
            </div>
          </div>
          <div className="heading-actions">
            <button className="text-button" onClick={newConversation} title="Start new session">
              <Plus size={15} /> New chat
            </button>
            {onClose && (
              <button className="icon-button" onClick={onClose} title="Close chat">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon"><Sparkles size={22} /></div>
              <div className="eyebrow">INTELLIGENT STORE ASSISTANT</div>
              <h2>How can we help you?</h2>
              <p>Ask about order tracking, coffee roasting, warranty, returns, or product advice.<br />Answers are grounded directly in our store knowledge base.</p>
              <div className="suggestions">
                <button onClick={() => send('Check my latest orders and shipping status')}>
                  <span><ArrowUp size={15} /></span> Check my order status
                </button>
                <button onClick={() => send('What are the flavor notes and origin of Yirgacheffe coffee?')}>
                  <span><RotateCcw size={15} /></span> Ask about Ethiopian coffees
                </button>
                <button onClick={() => send('What is the warranty on the Addis ANC Pro headphones?')}>
                  <span><CircleHelp size={15} /></span> Check warranty & returns
                </button>
              </div>
            </div>
          ) : (
            <div className="message-list">
              <div className="date-divider"><span>Active Assistant Conversation</span></div>
              {messages.map((msg, index) => (
                <div key={msg.id || index} className={`message-row ${msg.role}`}>
                  <div className={msg.role === 'assistant' ? 'message-avatar' : 'user-avatar'}>
                    {msg.role === 'assistant' ? <Bot size={16} /> : profile.full_name?.slice(0, 1)?.toUpperCase()}
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      {msg.role === 'assistant' ? 'Addis AI' : profile.full_name}
                      <span>· {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</span>
                    </div>
                    <div className="bubble">
                      {msg.content}
                      {msg.tools?.map((entry, i) => (
                        <div className="tool-result" key={i}>
                          <div className="tool-label"><Check size={13} /> {entry.tool?.replaceAll('_', ' ').toUpperCase()}</div>
                          {entry.result?.order_number && <strong>Order {entry.result.order_number}</strong>}
                          {entry.result?.status && <span>Status: {entry.result.status}</span>}
                          {entry.result?.estimated_delivery && <span>Estimated delivery: {entry.result.estimated_delivery}</span>}
                          {entry.result?.carrier && <span>Carrier: {entry.result.carrier}</span>}
                          {entry.result?.total_amount && <span>Total: {entry.result.total_amount} ETB</span>}
                          {entry.result?.ticket_id && <span>Ticket: {entry.result.ticket_id} ({entry.result.priority || 'high'})</span>}
                          {entry.result?.found === false && <span>Order was not found on your profile.</span>}
                        </div>
                      ))}
                    </div>
                    {(msg.sources || []).length > 0 && (
                      <div className="citations">
                        <span>Sources</span>
                        {(msg.sources || []).map(source => <span className="source-badge" key={source}>{source}</span>)}
                      </div>
                    )}
                    {msg.role === 'assistant' && (
                      <button className="speak-button" onClick={() => speak(msg.content)} title="Listen in native Ethiopian voice">
                        <Volume2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="message-row assistant">
                  <div className="message-avatar"><Bot size={16} /></div>
                  <div className="message-content">
                    <div className="message-meta">Addis AI <span>· thinking</span></div>
                    <div className="bubble typing"><i /><i /><i /></div>
                  </div>
                </div>
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>

        {handoff && (
          <div className="handoff-banner">
            <LifeBuoy size={16} />
            <span>A support ticket has been opened and flagged for staff follow-up.</span>
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}

        <div className="composer-wrap">
          <div className="composer">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about products, orders, returns, or company info..."
              rows={1}
            />
            <div className="composer-tools">
              <div className="composer-left">
                <input ref={fileInput} hidden type="file" accept="audio/*" onChange={e => transcribe(e.target.files?.[0])} />
                <button
                  className={`tool-button mic ${recording ? 'recording' : ''}`}
                  title={recording ? 'Stop recording' : 'Record voice message (Amharic, Oromo, Tigrinya)'}
                  onClick={recordVoice}
                >
                  <Mic size={16} />
                </button>
                <button className="tool-button attach" title="Upload audio for transcription" onClick={() => fileInput.current?.click()}>
                  <AudioLines size={16} />
                </button>
                <span className="composer-hint">Addis AI Multilingual Agent</span>
              </div>
              <button
                className={`send-button ${message.trim() && !busy ? 'ready' : ''}`}
                disabled={!message.trim() || busy}
                onClick={() => send()}
                title="Send message"
              >
                <ArrowUp size={17} />
              </button>
            </div>
          </div>
          <div className="composer-foot">
            Powered by <span>Addis AI</span> · Support for <span>Amharic, Afaan Oromo, Tigrinya & English</span>
          </div>
        </div>
      </section>
    </div>
  )
}

