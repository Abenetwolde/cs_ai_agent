import React, { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, BookOpen, Bot, Check, FileText, LogOut, Package, RefreshCw, Send, ShieldCheck, Sparkles, Ticket, Upload, Users } from 'lucide-react'

type Tab = 'overview' | 'users' | 'orders' | 'activity' | 'knowledge' | 'copilot'
type Overview = { users: number; orders: number; tickets: number; open_tickets: number; conversations: number; escalated_conversations: number }
type AdminUser = { id: string; full_name: string; email?: string | null; phone?: string | null; preferred_language: string; created_at: string; orders: number; tickets: number; conversations: number }
type AdminOrder = { order_number: string; customer: string; email?: string | null; status: string; estimated_delivery?: string | null; carrier?: string | null; items: Array<{ name?: string; quantity?: number }> }
type ActivityItem = { type: string; at: string; customer: string; customer_email?: string | null; summary: string; status?: string; speaker?: string; ticket_number?: string; priority?: string }
type RagFile = { name: string; bytes: number; updated_at: number }
type RagJob = { id: string; file_name: string; status: string; chunks_indexed: number; error?: string }

const labels: Record<Tab, string> = { overview: 'Overview', users: 'Customers', orders: 'Orders', activity: 'Activity', knowledge: 'Knowledge base', copilot: 'AI Copilot' }
const icons: Record<Tab, React.ReactNode> = { overview: <Activity size={17}/>, users: <Users size={17}/>, orders: <Package size={17}/>, activity: <Ticket size={17}/>, knowledge: <BookOpen size={17}/>, copilot: <Bot size={17}/> }
const date = (value?: string | number) => value ? new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString() : '—'
const prettySize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function AdminPortal() {
  const [token, setToken] = useState(() => localStorage.getItem('addis-admin-token') || '')
  const [email, setEmail] = useState(() => localStorage.getItem('addis-admin-email') || '')
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [files, setFiles] = useState<RagFile[]>([])
  const [jobs, setJobs] = useState<RagJob[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function signOut() {
    localStorage.removeItem('addis-admin-token'); localStorage.removeItem('addis-admin-email')
    setToken(''); setOverview(null); setUsers([]); setOrders([]); setActivity([]); setFiles([]); setJobs([])
  }

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(path, { ...init, headers })
    const body = await response.json().catch(() => ({}))
    if (response.status === 401 && token) signOut()
    if (!response.ok) throw new Error(body.detail || 'The request could not be completed.')
    return body
  }

  async function refresh() {
    if (!token) return
    setBusy(true); setError('')
    try {
      const [summary, customerData, orderData, activityData, ragData] = await Promise.all([
        api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/orders'), api('/api/admin/activity'), api('/api/admin/rag/files'),
      ])
      setOverview(summary); setUsers(customerData.users || []); setOrders(orderData.orders || [])
      setActivity(activityData.activity || []); setFiles(ragData.files || []); setJobs(ragData.jobs || [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load admin data.') }
    finally { setBusy(false) }
  }

  useEffect(() => { if (token) refresh() }, [token])
  useEffect(() => {
    if (!token || !jobs.some(job => job.status === 'queued' || job.status === 'processing')) return
    const timer = window.setInterval(refresh, 2500)
    return () => window.clearInterval(timer)
  }, [token, jobs])

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not sign in.')
      localStorage.setItem('addis-admin-token', data.access_token); localStorage.setItem('addis-admin-email', data.email)
      setEmail(data.email); setToken(data.access_token); setPassword('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in.') }
    finally { setBusy(false) }
  }

  async function upload(file?: File) {
    if (!file) return
    setUploading(true); setError(''); setNotice('')
    try {
      const form = new FormData(); form.append('file', file)
      const result = await api('/api/admin/rag/files', { method: 'POST', body: form })
      setNotice(result.status === 'queued' ? `${file.name} is queued for indexing.` : `${file.name} indexed with ${result.chunks_indexed} chunks.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.') }
    finally { setUploading(false) }
  }

  async function removeFile(file: RagFile) {
    if (!window.confirm(`Remove ${file.name} and its indexed chunks?`)) return
    setError(''); setNotice('')
    try { await api(`/api/admin/rag/files/${encodeURIComponent(file.name)}`, { method: 'DELETE' }); setNotice(`${file.name} removed from the knowledge base.`); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove file.') }
  }

  if (!token) return <main className="admin-login-page"><div className="admin-login-card"><div className="admin-brand-mark"><ShieldCheck size={21}/></div><div className="admin-eyebrow">ADDIS AI · ADMINISTRATION</div><h1>Welcome back</h1><p>Sign in to manage customer support operations.</p><form onSubmit={signIn}><label>Admin email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@addisai.local"/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <div className="admin-alert">{error}</div>}<button className="admin-primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to dashboard'}</button></form><a className="admin-back-link" href="/">← Return to customer support</a></div></main>

  return <div className="admin-layout"><aside className="admin-sidebar"><a className="admin-brand" href="/admin"><span className="admin-brand-mark"><ShieldCheck size={19}/></span><span>Addis<span>AI</span><small>ADMIN CONSOLE</small></span></a><div className="admin-nav-label">WORKSPACE</div><nav>{(Object.keys(labels) as Tab[]).map(item => <button key={item} className={`admin-nav-item ${tab === item ? 'selected' : ''}`} onClick={() => setTab(item)}>{icons[item]}<span>{labels[item]}</span>{item === 'activity' && overview?.open_tickets ? <i>{overview.open_tickets}</i> : null}</button>)}</nav><div className="admin-sidebar-bottom"><div className="admin-account"><div className="admin-avatar">{email.slice(0, 1).toUpperCase()}</div><span><strong>{email}</strong><small>Administrator</small></span></div><button className="admin-logout" onClick={signOut}><LogOut size={16}/> Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><div className="admin-breadcrumb">ADMINISTRATION <span>/</span> {labels[tab].toUpperCase()}</div><h1>{labels[tab]}</h1></div><button className="admin-icon-button" onClick={refresh} disabled={busy} title="Refresh data"><RefreshCw className={busy ? 'admin-spin' : ''} size={17}/></button></header>
      {error && <div className="admin-alert admin-page-alert">{error}</div>}{notice && <div className="admin-success"><Check size={15}/>{notice}</div>}
      {tab === 'overview' && <><div className="admin-welcome"><div><span>OPERATIONS SNAPSHOT</span><h2>Your support workspace at a glance</h2><p>Monitor customer records, order activity, escalations, and knowledge coverage.</p></div><div className="admin-welcome-icon"><Activity size={24}/></div></div><div className="admin-stat-grid">{[
        { title: 'Total customers', value: overview?.users, icon: <Users/>, color: 'green' }, { title: 'Orders tracked', value: overview?.orders, icon: <Package/>, color: 'blue' }, { title: 'Open tickets', value: overview?.open_tickets, icon: <Ticket/>, color: 'amber' }, { title: 'Conversations', value: overview?.conversations, icon: <Activity/>, color: 'violet' },
      ].map(item => <div className="admin-stat-card" key={item.title}><div className={`admin-stat-icon ${item.color}`}>{item.icon}</div><span>{item.title}</span><strong>{item.value ?? '—'}</strong><small>{item.title === 'Open tickets' ? `${overview?.escalated_conversations || 0} conversations escalated` : 'Across your support workspace'}</small></div>)}</div><section className="admin-panel"><div className="admin-panel-heading"><div><h3>Recent support activity</h3><p>Latest conversations and tickets</p></div><button onClick={() => setTab('activity')}>View all <ArrowUpRight size={14}/></button></div><ActivityTable rows={activity.slice(0, 8)}/></section></>}
      {tab === 'users' && <section className="admin-panel"><div className="admin-panel-heading"><div><h3>Customer records</h3><p>{users.length} customer profiles in your database</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>CUSTOMER</th><th>CONTACT</th><th>LANGUAGE</th><th>ORDERS</th><th>TICKETS</th><th>JOINED</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.full_name}</strong><small>{user.conversations} conversations</small></td><td>{user.email || '—'}<small>{user.phone || ''}</small></td><td>{user.preferred_language.toUpperCase()}</td><td>{user.orders}</td><td>{user.tickets}</td><td>{date(user.created_at)}</td></tr>)}</tbody></table>{users.length === 0 && <EmptyState text="No customer profiles yet."/>}</div></section>}
      {tab === 'orders' && <section className="admin-panel"><div className="admin-panel-heading"><div><h3>Order activity</h3><p>Orders linked to customer profiles</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>STATUS</th><th>DELIVERY</th><th>CARRIER</th></tr></thead><tbody>{orders.map(order => <tr key={order.order_number}><td><strong>{order.order_number}</strong></td><td>{order.customer}<small>{order.email || ''}</small></td><td>{order.items?.map(item => item.name).filter(Boolean).join(', ') || '—'}</td><td><span className={`admin-status ${order.status.toLowerCase()}`}>{order.status}</span></td><td>{order.estimated_delivery || '—'}</td><td>{order.carrier || '—'}</td></tr>)}</tbody></table>{orders.length === 0 && <EmptyState text="No orders have been recorded."/>}</div></section>}
      {tab === 'activity' && <section className="admin-panel"><div className="admin-panel-heading"><div><h3>Support activity</h3><p>Recent customer messages, assistant replies, and support tickets</p></div></div><ActivityTable rows={activity}/></section>}
      {tab === 'knowledge' && <><section className="admin-upload-panel"><div className="admin-upload-icon"><Upload size={21}/></div><div className="admin-upload-copy"><h3>Upload knowledge documents</h3><p>Add or replace a Markdown, text, or PDF file. Existing chunks for the same filename are updated and removed when no longer present.</p></div><label className={`admin-upload-button ${uploading ? 'disabled' : ''}`}><Upload size={15}/>{uploading ? 'Indexing…' : 'Choose a file'}<input type="file" accept=".md,.txt,.pdf,text/plain,application/pdf" disabled={uploading} onChange={event => { upload(event.target.files?.[0]); event.currentTarget.value = '' }}/></label><small>Markdown, TXT, or PDF · Up to 20 MB</small></section><section className="admin-panel"><div className="admin-panel-heading"><div><h3>Knowledge files</h3><p>{files.length} documents available to the support assistant</p></div></div>{jobs.length > 0 && <div className="admin-job-list">{jobs.slice(0, 5).map(job => <div className="admin-job" key={job.id}><div className={`admin-job-dot ${job.status}`}/><span><strong>{job.file_name}</strong><small>{job.status === 'complete' ? `${job.chunks_indexed} chunks indexed` : job.error || job.status}</small></span><small>{job.status}</small></div>)}</div>}<div className="admin-file-list">{files.map(file => <div className="admin-file-row" key={file.name}><div className="admin-file-icon"><FileText size={17}/></div><span><strong>{file.name}</strong><small>{prettySize(file.bytes)} · Updated {date(file.updated_at)}</small></span><button onClick={() => removeFile(file)}>Remove</button></div>)}{files.length === 0 && <EmptyState text="Upload your first support policy or FAQ document."/>}</div></section></>}
      {tab === 'copilot' && <AdminCopilot token={token} onDataChanged={refresh} />}
      <footer className="admin-footer">Protected administration <span>·</span> Addis AI customer support</footer>
    </main>
  </div>
}

function AdminCopilot({ token, onDataChanged }: { token: string; onDataChanged: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; tools?: any[] }>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send(text = input) {
    const msg = text.trim()
    if (!msg || busy) return
    setInput('')
    setBusy(true)
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: msg, language: 'en', session_id: sessionId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to process admin chat.')
      if (data.session_id) setSessionId(data.session_id)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, tools: data.tool_results }])
      if (data.tool_results?.some((t: any) => t.tool?.startsWith('admin_update') || t.tool?.startsWith('admin_create'))) {
        onDataChanged()
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Operation failed'}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-copilot-container">
      <div className="admin-copilot-messages">
        {messages.length === 0 ? (
          <div className="admin-copilot-welcome">
            <div className="welcome-icon" style={{ margin: '0 auto 12px' }}><Bot size={28} /></div>
            <h2>Admin AI Copilot</h2>
            <p>
              Execute operational commands, inspect real-time metrics, update order delivery statuses, adjust inventory stock/prices, and resolve support tickets directly via natural language grounded in PostgreSQL.
            </p>
            <div className="admin-copilot-prompts">
              <button className="admin-copilot-prompt-btn" onClick={() => send('Give me an overview of total store revenue, orders and low stock items')}>
                <Sparkles size={14} /> Overview of store revenue, orders & low stock
              </button>
              <button className="admin-copilot-prompt-btn" onClick={() => send('List all processing orders')}>
                <Package size={14} /> List all processing orders
              </button>
              <button className="admin-copilot-prompt-btn" onClick={() => send('List low stock products with stock under 25')}>
                <Activity size={14} /> List low stock products
              </button>
              <button className="admin-copilot-prompt-btn" onClick={() => send('List all open customer support tickets')}>
                <Ticket size={14} /> List open support tickets
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} className={`message-row ${m.role}`} style={{ display: 'flex', gap: 10 }}>
              <div className={m.role === 'assistant' ? 'message-avatar' : 'user-avatar'}>
                {m.role === 'assistant' ? <Bot size={16} /> : 'A'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#7a857b', marginBottom: 4 }}>
                  {m.role === 'assistant' ? 'Addis AI Copilot' : 'Administrator'}
                </div>
                <div className="bubble" style={{ background: m.role === 'user' ? '#175f43' : '#fff', color: m.role === 'user' ? '#fff' : '#192b1f', border: m.role === 'user' ? '0' : '1px solid #e5ebe4', padding: '12px 16px', borderRadius: 12 }}>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.content}</div>
                  {m.tools?.map((toolEntry: any, tIdx: number) => (
                    <div key={tIdx} className="react-tool-card" style={{ marginTop: 10, background: '#fcfdfb' }}>
                      <div className="react-tool-header">
                        <span className="react-tool-badge"><Check size={12} /> {toolEntry.tool?.replaceAll('_', ' ').toUpperCase()}</span>
                      </div>
                      {toolEntry.tool === 'admin_get_overview' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
                          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2eae1' }}>
                            <span style={{ fontSize: 9, color: '#728173' }}>REVENUE</span>
                            <strong style={{ display: 'block', fontSize: 13, color: '#175f43' }}>{toolEntry.result?.total_revenue?.toLocaleString()} ETB</strong>
                          </div>
                          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2eae1' }}>
                            <span style={{ fontSize: 9, color: '#728173' }}>ORDERS</span>
                            <strong style={{ display: 'block', fontSize: 13 }}>{toolEntry.result?.total_orders}</strong>
                          </div>
                          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2eae1' }}>
                            <span style={{ fontSize: 9, color: '#728173' }}>CUSTOMERS</span>
                            <strong style={{ display: 'block', fontSize: 13 }}>{toolEntry.result?.total_customers}</strong>
                          </div>
                          <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2eae1' }}>
                            <span style={{ fontSize: 9, color: '#728173' }}>OPEN TICKETS</span>
                            <strong style={{ display: 'block', fontSize: 13, color: '#d97706' }}>{toolEntry.result?.active_tickets}</strong>
                          </div>
                        </div>
                      )}
                      {toolEntry.tool === 'admin_update_order_status' && (
                        <div style={{ fontSize: 12, color: '#1b4d35' }}>
                          Order <strong>{toolEntry.result?.order_number}</strong> updated to <span className="react-status-pill shipped">{toolEntry.result?.status}</span>
                        </div>
                      )}
                      {toolEntry.tool === 'admin_update_product' && (
                        <div style={{ fontSize: 12, color: '#1b4d35' }}>
                          Product #{toolEntry.result?.product_id} (<strong>{toolEntry.result?.product_name}</strong>) updated: Price = {toolEntry.result?.new_price} ETB, Stock = {toolEntry.result?.new_stock}
                        </div>
                      )}
                      {toolEntry.tool === 'admin_create_product' && (
                        <div style={{ fontSize: 12, color: '#1b4d35' }}>
                          Created new product #{toolEntry.result?.product_id} "<strong>{toolEntry.result?.product_name}</strong>" ({toolEntry.result?.price} ETB)
                        </div>
                      )}
                      {toolEntry.tool === 'admin_update_ticket' && (
                        <div style={{ fontSize: 12, color: '#1b4d35' }}>
                          Ticket <strong>{toolEntry.result?.ticket_number}</strong> status changed to <span className="react-status-pill delivered">{toolEntry.result?.status}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
        {busy && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="message-avatar"><Bot size={16} /></div>
            <div className="bubble typing" style={{ padding: '10px 16px', background: '#fff', border: '1px solid #e5ebe4', borderRadius: 12 }}><i /><i /><i /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="admin-copilot-composer">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Instruct Copilot e.g. 'Mark order ADDIS-1001 as shipped via Addis Express' or 'Update stock of product 1 to 50'..."
        />
        <button
          className="admin-primary-button"
          style={{ width: 'auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={!input.trim() || busy}
          onClick={() => send()}
        >
          <Send size={15} /> Send
        </button>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) { return <div className="admin-empty"><FileText size={21}/><span>{text}</span></div> }

function ActivityTable({ rows }: { rows: ActivityItem[] }) {
  if (!rows.length) return <EmptyState text="No recent activity."/>
  return <div className="admin-activity-list">{rows.map((row, index) => <div className="admin-activity-row" key={`${row.type}-${row.at}-${index}`}><div className={`admin-activity-icon ${row.type}`}><Activity size={16}/></div><div className="admin-activity-content"><div><strong>{row.customer}</strong><span>{row.type === 'ticket' ? `created ticket ${row.ticket_number}` : `${row.speaker === 'user' ? 'sent a message' : 'received a reply'}`}</span></div><p>{row.summary}</p><small>{row.customer_email || 'No email'} · {date(row.at)}{row.status ? ` · ${row.status}` : ''}{row.priority ? ` · ${row.priority} priority` : ''}</small></div></div>)}</div>
}
