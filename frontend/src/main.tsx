import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bot,
  ChevronDown,
  LogOut,
  Package,
  ShoppingBag,
  Sparkles,
  User,
  X
} from 'lucide-react'
import { AdminPortal } from './admin'
import { ChatWidget } from './chat'
import { StoreView } from './store'
import { CartItem, Language, Profile } from './types'
import './style.css'

const languages: Record<Language, string> = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo', ti: 'ትግርኛ' }
const parseSaved = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T | null
  } catch {
    return null
  }
}

function EcommerceApp() {
  const [profile, setProfile] = useState<Profile | null>(() => parseSaved<Profile>('addis-support-user'))
  const [language, setLanguage] = useState<Language>(() => profile?.preferred_language || 'en')
  const [activeTab, setActiveTab] = useState<'shop' | 'orders' | 'profile' | 'chat'>('shop')
  const [cart, setCart] = useState<CartItem[]>(() => parseSaved<CartItem[]>('addis-store-cart') || [])
  const [cartOpen, setCartOpen] = useState(false)
  const [floatingAiOpen, setFloatingAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState<string | undefined>(undefined)

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Save cart to local storage
  React.useEffect(() => {
    localStorage.setItem('addis-store-cart', JSON.stringify(cart))
  }, [cart])

  // Sign out
  const handleLogout = () => {
    localStorage.removeItem('addis-support-user')
    localStorage.removeItem('addis-support-session')
    setProfile(null)
    setActiveTab('shop')
  }

  // Trigger AI assistant from any product or order
  const handleAskAI = (prompt: string) => {
    setAiPrompt(prompt)
    setFloatingAiOpen(true)
  }

  return (
    <main className="app-shell">
      {/* GLOBAL NAVIGATION HEADER */}
      <header className="topbar">
        <div className="brand" onClick={() => setActiveTab('shop')} style={{ cursor: 'pointer' }}>
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>
            Addis<span className="brand-light">AI</span> Store
          </span>
          <span className="brand-divider" />
          <span className="brand-product">Ethiopian Goods & Tech</span>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'shop' ? 'active' : ''}`}
            onClick={() => setActiveTab('shop')}
          >
            <ShoppingBag size={16} />
            <span>Store</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <Package size={16} />
            <span>My Orders</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <Bot size={16} />
            <span>AI Customer Care</span>
            <span className="ai-live-dot" />
          </button>
        </nav>

        {/* Header Right Actions */}
        <div className="top-actions">
          {/* Language Switcher */}
          <label className="language-select">
            <span>{languages[language]}</span>
            <ChevronDown size={14} />
            <select
              aria-label="Language"
              value={language}
              onChange={e => {
                const newLang = e.target.value as Language
                setLanguage(newLang)
                if (profile) {
                  const updated = { ...profile, preferred_language: newLang }
                  setProfile(updated)
                  localStorage.setItem('addis-support-user', JSON.stringify(updated))
                }
              }}
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {/* Cart Button */}
          <button className="cart-badge-btn" onClick={() => setCartOpen(true)} title="View Cart">
            <ShoppingBag size={17} />
            <span className="cart-badge-text">Cart</span>
            {cartTotalItems > 0 && <span className="cart-badge-counter">{cartTotalItems}</span>}
          </button>

          {/* User Profile or Sign-in */}
          {profile ? (
            <div className="user-profile-menu">
              <button
                className="user-profile-btn"
                onClick={() => setActiveTab(activeTab === 'profile' ? 'shop' : 'profile')}
                title="Account & Profile"
              >
                <div className="avatar">{profile.full_name?.slice(0, 1)?.toUpperCase() || 'U'}</div>
                <span className="user-name-text">{profile.full_name}</span>
              </button>
              <button className="icon-button logout-btn" onClick={handleLogout} title="Sign Out">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button className="sign-in-pill-btn" onClick={() => setActiveTab('profile')}>
              <User size={15} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN VIEW CONTENT */}
      {activeTab === 'chat' ? (
        <ChatWidget
          profile={profile}
          setProfile={setProfile}
          language={language}
          setLanguage={setLanguage}
          initialPrompt={aiPrompt}
        />
      ) : (
        <StoreView
          profile={profile}
          setProfile={setProfile}
          language={language}
          cart={cart}
          setCart={setCart}
          cartOpen={cartOpen}
          setCartOpen={setCartOpen}
          onAskAI={handleAskAI}
          onOpenAI={() => setFloatingAiOpen(true)}
          activeTab={activeTab as 'shop' | 'orders' | 'profile'}
          setActiveTab={setActiveTab as (tab: 'shop' | 'orders' | 'profile') => void}
        />
      )}

      {/* FLOATING AI ASSISTANT WIDGET */}
      {activeTab !== 'chat' && (
        <div className="floating-ai-anchor">
          {floatingAiOpen ? (
            <div className="floating-ai-window">
              <ChatWidget
                profile={profile}
                setProfile={setProfile}
                language={language}
                setLanguage={setLanguage}
                initialPrompt={aiPrompt}
                onClose={() => {
                  setFloatingAiOpen(false)
                  setAiPrompt(undefined)
                }}
                isFloating={true}
              />
            </div>
          ) : (
            <button
              className="floating-ai-fab"
              onClick={() => setFloatingAiOpen(true)}
              title="Open Addis AI Assistant"
            >
              <div className="fab-bot-icon">
                <Bot size={20} />
                <span className="fab-pulse-dot" />
              </div>
              <span className="fab-label">Addis AI Assistant</span>
            </button>
          )}
        </div>
      )}
    </main>
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing app root element.')
createRoot(rootElement).render(location.pathname.startsWith('/admin') ? <AdminPortal /> : <EcommerceApp />)
