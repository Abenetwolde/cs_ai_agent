import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDown, ArrowUp, AudioLines, Bot, Check, ChevronDown, CircleHelp, Headphones, LifeBuoy, Mic, Plus, RotateCcw, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'
import './style.css'

const labels = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo', ti: 'ትግርኛ' }
function displayText(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try { return JSON.stringify(value) } catch { return String(value) }
}
function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null
  return { role: message.role === 'user' ? 'user' : 'assistant', content: displayText(message.content) }
}
function App() {
  const [messages, setMessages] = useState([]), [input, setInput] = useState(''), [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState('en'), [session, setSession] = useState(() => localStorage.getItem('addis-support-session'))
  const [handoff, setHandoff] = useState(false), [recording, setRecording] = useState(false), [notice, setNotice] = useState('')
  const bottom = useRef(null), fileRef = useRef(null), mediaRef = useRef(null)
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, loading])
  useEffect(() => {
    if (!session) return
    fetch(`/api/sessions/${session}`).then(r => r.json()).then(data => { setMessages(Array.isArray(data.messages) ? data.messages.map(normalizeMessage).filter(Boolean) : []); setHandoff(Boolean(data.handoff)) }).catch(() => {})
  }, [])

  async function send(text = input) {
    const value = text.trim(); if (!value || loading) return
    setInput(''); setNotice(''); setMessages(items => [...items, { role: 'user', content: value }]); setLoading(true)
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session, message: value, language }) })
      const data = await res.json(); if (!res.ok) throw Error(data.detail || 'Could not reach support.')
      setSession(data.session_id); localStorage.setItem('addis-support-session', data.session_id); setHandoff(data.handoff)
      setMessages(items => [...items, { role: 'assistant', content: displayText(data.reply), tool: data.tool_result && typeof data.tool_result === 'object' ? data.tool_result : null }])
    } catch (error) { setNotice(error.message); setMessages(items => items.slice(0, -1)) }
    finally { setLoading(false) }
  }
  async function reset() {
    if (session) await fetch(`/api/sessions/${session}`, { method: 'DELETE' }).catch(() => {})
    setSession(null); localStorage.removeItem('addis-support-session'); setMessages([]); setHandoff(false); setNotice('')
  }
  async function transcribe(file) {
    if (!file) return
    setNotice('Transcribing audio…')
    try { const form = new FormData(); form.append('audio', file); const res = await fetch('/api/transcribe', { method: 'POST', body: form }); const data = await res.json(); if (!res.ok) throw Error(data.detail); setInput(data.text); setNotice('') }
    catch (e) { setNotice(e.message || 'Transcription failed.') }
    if (fileRef.current) fileRef.current.value = ''
  }
  async function speak(text) {
    if (language === 'en') { setNotice('Addis Voices playback is available for Amharic, Afaan Oromo, and Tigrinya.'); return }
    try { const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language }) }); const data = await res.json(); if (!res.ok) throw Error(data.detail); const audio = new Audio(`data:${data.content_type};base64,${data.audio}`); audio.play() }
    catch (e) { setNotice(e.message || 'Voice playback failed.') }
  }
  async function toggleRecording() {
    if (recording) { mediaRef.current?.stop(); setRecording(false); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const rec = new MediaRecorder(stream); const chunks = []
      rec.ondataavailable = e => chunks.push(e.data); rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); transcribe(new File(chunks, 'recording.webm', { type: chunks[0]?.type || 'audio/webm' })) }
      rec.start(); mediaRef.current = rec; setRecording(true)
    } catch { setNotice('Microphone access is unavailable. You can also attach an audio file.') }
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Sparkles size={19}/></span><span>Addis<span className="brand-light">AI</span></span><span className="brand-divider"/><span className="brand-product">Customer care</span></a><div className="top-actions"><label className="language-select"><span>{labels[language]}</span><ChevronDown size={14}/><select aria-label="Language" value={language} onChange={e => setLanguage(e.target.value)}>{Object.entries(labels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><button className="icon-button reset-button" onClick={reset} title="Start a new chat"><RotateCcw size={16}/><span>New chat</span></button><div className="avatar">A</div></div></header>
    <section className="workspace"><aside className="sidebar"><div className="sidebar-title">YOUR SUPPORT <span className="tiny-dot"/></div><div className="active-chat"><span className="active-icon"><Headphones size={17}/></span><span><strong>Customer care</strong><small>AI support · available now</small></span><span className="active-indicator"/></div><div className="sidebar-card"><div className="shield"><ShieldCheck size={18}/></div><strong>Here to help</strong><p>Get answers on orders, products, and account support.</p><div className="availability"><i/> Usually replies instantly</div></div><div className="sidebar-bottom"><span className="secure-icon"><ShieldCheck size={14}/></span><span>Your conversation is private</span></div></aside>
    <section className="chat-panel"><div className="chat-heading"><div><div className="chat-title"><div className="bot-badge"><Bot size={19}/></div><div><h1>Customer care</h1><div className="online"><i/> Online · Addis AI assistant</div></div></div></div><div className="heading-actions"><button className="text-button" onClick={reset}><Plus size={15}/> New conversation</button><button className="more-button" aria-label="More options"><span/><span/><span/></button></div></div>
      <div className="messages-area">{messages.length === 0 ? <div className="welcome"><div className="welcome-icon"><Sparkles size={22}/></div><div className="eyebrow">ADDIS AI CUSTOMER CARE</div><h2>How can we help<br/>you today?</h2><p>Ask us anything about your order, product, or account.<br/>We’re here to make things easier.</p><div className="suggestions"><button onClick={() => send('How can I track my order?')}><span><ArrowDown size={15}/></span> Track my order <ArrowUp className="suggest-arrow" size={14}/></button><button onClick={() => send('How do returns work?')}><span><RotateCcw size={15}/></span> Returns & refunds <ArrowUp className="suggest-arrow" size={14}/></button><button onClick={() => send('I need help with my account')}><span><CircleHelp size={15}/></span> Account support <ArrowUp className="suggest-arrow" size={14}/></button></div></div> : <div className="message-list"><div className="date-divider"><span>Today</span></div>{messages.map((msg, i) => <div key={i} className={`message-row ${msg.role}`}><div className={msg.role === 'assistant' ? 'message-avatar' : 'user-avatar'}>{msg.role === 'assistant' ? <Bot size={16}/> : 'Y'}</div><div className="message-content"><div className="message-meta">{msg.role === 'assistant' ? 'Addis AI' : 'You'} <span>· {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div className="bubble">{displayText(msg.content)}{msg.tool && typeof msg.tool === 'object' && <div className="tool-result"><div className="tool-label"><Check size={13}/> ORDER LOOKUP</div>{msg.tool.found ? <><strong>{displayText(msg.tool.order_id)}</strong><span>Status: {displayText(msg.tool.status)}</span><span>Estimated delivery: {displayText(msg.tool.eta)}</span></> : <span>We couldn’t find that order ID.</span>}</div>}</div>{msg.role === 'assistant' && <button className="speak-button" onClick={() => speak(displayText(msg.content))} title="Listen"><Volume2 size={14}/></button>}</div></div>)}{loading && <div className="message-row assistant"><div className="message-avatar"><Bot size={16}/></div><div className="message-content"><div className="message-meta">Addis AI <span>· typing</span></div><div className="bubble typing"><i/><i/><i/></div></div></div>}<div ref={bottom}/></div>}</div>
      {handoff && <div className="handoff-banner"><LifeBuoy size={16}/><span>Our support team has been notified and will follow up.</span></div>}{notice && <div className="notice">{notice}</div>}
      <div className="composer-wrap"><div className="composer"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Write a message..." rows="1"/><div className="composer-tools"><div className="composer-left"><input ref={fileRef} hidden type="file" accept="audio/*" onChange={e => transcribe(e.target.files[0])}/><button className={`tool-button mic ${recording ? 'recording' : ''}`} title={recording ? 'Stop recording' : 'Record a voice message'} onClick={toggleRecording}><Mic size={16}/></button><button className="tool-button attach" title="Upload audio" onClick={() => fileRef.current?.click()}><AudioLines size={16}/></button><span className="composer-hint">{recording ? 'Recording · click mic to stop' : 'AI can make mistakes. Check important information.'}</span></div><button className={`send-button ${input.trim() && !loading ? 'ready' : ''}`} disabled={!input.trim() || loading} onClick={() => send()} title="Send message"><ArrowUp size={17}/></button></div></div><div className="composer-foot">Powered by <span>Addis AI</span><span className="foot-separator">·</span> Support for <span>Amharic, Afaan Oromo, Tigrinya & English</span></div></div>
    </section></section>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
