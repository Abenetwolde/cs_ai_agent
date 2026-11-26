import React, { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Headphones,
  LifeBuoy,
  LogOut,
  Mic,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
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

function ReactToolCard({ tool, result, onAction }: { tool: string; result: any; onAction: (prompt: string) => void }) {
  if (!result) return null

  // 1. Search Products Catalog
  if (tool === 'search_products') {
    const products = result.products || []
    if (products.length === 0) return null
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge"><ShoppingBag size={13} /> PRODUCTS ({products.length})</span>
        </div>
        <div className="react-product-grid">
          {products.slice(0, 4).map((p: any) => (
            <div key={p.id} className="react-product-chip">
              {p.image_url && <img src={p.image_url} alt={p.name} className="react-product-thumb" />}
              <span className="react-product-title">{p.name}</span>
              <span className="react-product-price">{p.price?.toLocaleString()} ETB</span>
              <button className="react-action-btn" onClick={() => onAction(`Add ${p.name} to my cart`)}>
                <ShoppingBag size={12} /> Add to Cart
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 2. Product Details
  if (tool === 'get_product_details') {
    const p = result.product
    if (!p) return null
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge"><Sparkles size={13} /> PRODUCT DETAILS</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: 75, height: 75, objectFit: 'cover', borderRadius: 8 }} />}
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 13, display: 'block', color: '#182b20' }}>{p.name}</strong>
            <span style={{ fontSize: 12, color: '#175f43', fontWeight: 700 }}>{p.price?.toLocaleString()} ETB</span>
            <span style={{ fontSize: 11, color: '#68786c', display: 'block' }}>{p.category} · Stock: {p.stock}</span>
          </div>
          <button className="react-action-btn" onClick={() => onAction(`Add ${p.name} to my cart`)}>
            <ShoppingBag size={12} /> Add
          </button>
        </div>
      </div>
    )
  }

  // 3. View Cart
  if (tool === 'view_cart') {
    const items = result.items || []
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge"><ShoppingBag size={13} /> SHOPPING CART ({result.total_items || items.length} ITEMS)</span>
        </div>
        {items.length === 0 ? (
          <p style={{ margin: '4px 0', fontSize: 12, color: '#657367' }}>Your shopping cart is currently empty.</p>
        ) : (
          <div className="react-cart-summary">
            {items.map((i: any) => (
              <div key={i.cart_item_id || i.product_id} className="react-cart-line">
                <span>{i.name} (x{i.quantity})</span>
                <strong>{i.line_total?.toLocaleString()} ETB</strong>
              </div>
            ))}
            <div className="react-cart-totals">
              <span>Grand Total {result.shipping === 0 ? '(Free Shipping)' : `(+${result.shipping} ETB shipping)`}</span>
              <strong style={{ color: '#175f43' }}>{result.grand_total?.toLocaleString()} ETB</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="react-action-btn" onClick={() => onAction('I want to checkout my cart')}>
                <CreditCard size={12} /> Checkout Cart
              </button>
              <button className="react-action-btn secondary" onClick={() => onAction('Clear my cart')}>
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 4. Add to Cart
  if (tool === 'add_to_cart') {
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge" style={{ background: '#dcfce7', color: '#15803d' }}>
            <Check size={13} /> ADDED TO CART
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>+{result.quantity_added}x {result.product_name}</strong>
            <span style={{ display: 'block', fontSize: 11, color: '#627065' }}>Total Cart: {result.total_items} items ({result.grand_total?.toLocaleString()} ETB)</span>
          </div>
          <button className="react-action-btn" onClick={() => onAction('View my cart')}>
            View Cart
          </button>
        </div>
      </div>
    )
  }

  // 5. Checkout Cart
  if (tool === 'checkout_cart') {
    if (!result.checked_out) return null
    return (
      <div className="react-tool-card" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
        <div className="react-tool-header">
          <span className="react-tool-badge" style={{ background: '#22c55e', color: '#fff' }}>
            <Check size={13} /> ORDER PLACED #{result.order_number}
          </span>
        </div>
        <div className="react-order-status-card">
          <div>Estimated Delivery: <strong>{result.estimated_delivery}</strong> via <strong>{result.carrier}</strong></div>
          <div>Total Paid: <strong style={{ color: '#175f43' }}>{result.total_amount?.toLocaleString()} ETB</strong></div>
          <div style={{ fontSize: 11, color: '#57675a' }}>Delivery to: {result.shipping_address}</div>
          <button className="react-action-btn" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => onAction(`Check order ${result.order_number}`)}>
            <Package size={12} /> Track Order
          </button>
        </div>
      </div>
    )
  }

  // 6. Lookup User Orders
  if (tool === 'lookup_user_orders') {
    if (!result.found) return null
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge"><Package size={13} /> ORDER {result.order_number}</span>
          <span className={`react-status-pill ${result.status?.toLowerCase()}`}>{result.status}</span>
        </div>
        <div className="react-order-status-card">
          <div>ETA: <strong>{result.estimated_delivery || 'Calculating'}</strong> · Carrier: <strong>{result.carrier || 'Addis Express'}</strong></div>
          <div>Total: <strong>{result.total_amount?.toLocaleString()} ETB</strong> ({result.items?.length || 0} items)</div>
          {result.status === 'processing' && (
            <button className="react-action-btn secondary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => onAction(`Cancel order ${result.order_number}`)}>
              Cancel Order
            </button>
          )}
        </div>
      </div>
    )
  }

  // 7. List My Orders
  if (tool === 'list_my_orders') {
    const orders = result.orders || []
    if (orders.length === 0) return null
    return (
      <div className="react-tool-card">
        <div className="react-tool-header">
          <span className="react-tool-badge"><Package size={13} /> YOUR ORDERS ({orders.length})</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orders.slice(0, 4).map((o: any) => (
            <div key={o.order_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f4ef' }}>
              <div>
                <strong>{o.order_number}</strong>
                <span style={{ display: 'block', fontSize: 11, color: '#68786b' }}>{o.total_amount?.toLocaleString()} ETB · {o.items?.length || 0} items</span>
              </div>
              <span className={`react-status-pill ${o.status?.toLowerCase()}`}>{o.status}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 8. Admin Overview
  if (tool === 'admin_get_overview') {
    return (
      <div className="react-tool-card" style={{ background: '#f8faf7' }}>
        <div className="react-tool-header">
          <span className="react-tool-badge"><Sparkles size={13} /> STORE OVERVIEW ANALYTICS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6 }}>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e7ede6' }}>
            <span style={{ fontSize: 10, color: '#738174' }}>TOTAL REVENUE</span>
            <strong style={{ display: 'block', fontSize: 14, color: '#175f43' }}>{result.total_revenue?.toLocaleString()} ETB</strong>
          </div>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e7ede6' }}>
            <span style={{ fontSize: 10, color: '#738174' }}>TOTAL ORDERS</span>
            <strong style={{ display: 'block', fontSize: 14 }}>{result.total_orders}</strong>
          </div>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e7ede6' }}>
            <span style={{ fontSize: 10, color: '#738174' }}>CUSTOMERS</span>
            <strong style={{ display: 'block', fontSize: 14 }}>{result.total_customers}</strong>
          </div>
          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e7ede6' }}>
            <span style={{ fontSize: 10, color: '#738174' }}>OPEN TICKETS</span>
            <strong style={{ display: 'block', fontSize: 14, color: '#d97706' }}>{result.active_tickets}</strong>
          </div>
        </div>
      </div>
    )
  }

  // Generic fallback for any other tool
  return (
    <div className="tool-result">
      <div className="tool-label"><Check size={13} /> {tool?.replaceAll('_', ' ').toUpperCase()}</div>
      {result?.order_number && <strong>Order {result.order_number}</strong>}
      {result?.status && <span>Status: {result.status}</span>}
      {result?.ticket_id && <span>Ticket: {result.ticket_id}</span>}
      {result?.ticket_number && <span>Ticket: {result.ticket_number}</span>}
      {result?.product_name && <span>Product: {result.product_name}</span>}
    </div>
  )
}

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
      if (data.cart_updated) {
        window.dispatchEvent(new CustomEvent('addis-cart-updated'))
      }
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
                <button onClick={() => send('What is in my shopping cart?')}>
                  <span><ShoppingBag size={15} /></span> What is in my shopping cart?
                </button>
                <button onClick={() => send('Browse Ethiopian coffees and tech gadgets')}>
                  <span><Sparkles size={15} /></span> Browse catalog products
                </button>
                <button onClick={() => send('Check my latest orders and shipping status')}>
                  <span><Package size={15} /></span> Check my order status
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
                      <div className="bubble-text">{msg.content}</div>
                      {msg.tools?.map((entry, i) => (
                        <ReactToolCard key={i} tool={entry.tool} result={entry.result} onAction={send} />
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

