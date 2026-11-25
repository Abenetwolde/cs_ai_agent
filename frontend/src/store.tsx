import React, { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Heart,
  HelpCircle,
  MapPin,
  Package,
  Phone,
  Plus,
  Minus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Truck,
  User,
  X,
  Zap
} from 'lucide-react'
import { CartItem, Language, Order, Product, Profile } from './types'

interface StoreProps {
  profile: Profile | null
  setProfile: (p: Profile | null) => void
  language: Language
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  onAskAI: (prompt: string) => void
  onOpenAI: () => void
  activeTab: 'shop' | 'orders' | 'profile'
  setActiveTab: (tab: 'shop' | 'orders' | 'profile') => void
}

const CATEGORIES = [
  'All',
  'Coffee & Gourmet',
  'Electronics',
  'Fashion & Leather',
  'Fashion & Traditional',
  'Home & Living'
]

export function StoreView({
  profile,
  setProfile,
  language,
  cart,
  setCart,
  cartOpen,
  setCartOpen,
  onAskAI,
  onOpenAI,
  activeTab,
  setActiveTab
}: StoreProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Orders & Profile states
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Checkout modal states
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [shippingAddress, setShippingAddress] = useState('Bole Subcity, Woreda 03, Addis Ababa')
  const [paymentMethod, setPaymentMethod] = useState<'Telebirr' | 'CBE Birr' | 'Demo Card' | 'Cash on Delivery'>('Telebirr')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)

  // Registration modal states
  const [regModalOpen, setRegModalOpen] = useState(false)
  const [regName, setRegName] = useState(profile?.full_name || '')
  const [regEmail, setRegEmail] = useState(profile?.email || '')
  const [regPhone, setRegPhone] = useState(profile?.phone || '')
  const [regNotice, setRegNotice] = useState('')
  const [regBusy, setRegBusy] = useState(false)

  // Fetch products
  useEffect(() => {
    let cancelled = false
    async function loadProducts() {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (selectedCategory !== 'All') params.append('category', selectedCategory)
        if (searchQuery.trim()) params.append('search', searchQuery.trim())
        const res = await fetch(`/api/products?${params.toString()}`)
        const data = await res.json()
        if (!cancelled && data.products) {
          setProducts(data.products)
        }
      } catch (e) {
        console.error('Failed to load products', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProducts()
    return () => { cancelled = true }
  }, [selectedCategory, searchQuery])

  // Fetch user orders when orders or profile tab is active
  useEffect(() => {
    if (!profile?.id) return
    async function loadOrders() {
      setLoadingOrders(true)
      try {
        const res = await fetch(`/api/users/${profile?.id}/orders`)
        const data = await res.json()
        if (data.orders) setOrders(data.orders)
      } catch (e) {
        console.error('Failed to load orders', e)
      } finally {
        setLoadingOrders(false)
      }
    }
    loadOrders()
  }, [profile?.id, activeTab])

  // Cart operations
  const addToCart = (product: Product, qty: number = 1) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx].quantity += qty
        return updated
      }
      return [...prev, { product, quantity: qty }]
    })
  }

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean) as CartItem[]
    })
  }

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const shippingFee = subtotal === 0 || subtotal >= 2000 ? 0 : 150
  const grandTotal = subtotal + shippingFee

  // Handle register/save profile
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegBusy(true)
    setRegNotice('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: regName,
          email: regEmail || null,
          phone: regPhone || null,
          preferred_language: language
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not save profile.')
      localStorage.setItem('addis-support-user', JSON.stringify(data.user))
      setProfile(data.user)
      setRegModalOpen(false)
    } catch (err: any) {
      setRegNotice(err.message || 'Registration failed.')
    } finally {
      setRegBusy(false)
    }
  }

  // Handle checkout order placement
  async function handlePlaceOrder() {
    if (!profile) {
      setRegModalOpen(true)
      return
    }
    if (cart.length === 0) return

    setProcessingPayment(true)
    try {
      // Simulate demo payment processing delay
      await new Promise(r => setTimeout(r, 1200))

      const items = cart.map(item => ({
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        image_url: item.product.image_url
      }))

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          items,
          total_amount: grandTotal,
          payment_method: paymentMethod,
          shipping_address: shippingAddress
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to place order.')

      setCompletedOrder(data.order)
      setCart([])
      setOrders(prev => [data.order, ...prev])
    } catch (e: any) {
      alert(e.message || 'Order failed')
    } finally {
      setProcessingPayment(false)
    }
  }

  return (
    <div className="store-container">
      {/* 1. HERO BANNER (When on shop tab) */}
      {activeTab === 'shop' && (
        <section className="store-hero">
          <div className="hero-content">
            <div className="hero-badge">
              <Sparkles size={14} /> ADDIS AI MULTILINGUAL COMMERCE
            </div>
            <h1>Ethiopia’s Finest Goods,<br />Powered by Intelligent AI</h1>
            <p>
              Explore single-origin highland coffees, handcrafted artisan leather, traditional Shema cotton, and high-tech gadgets.
              Ask Addis AI anytime for instant recommendations or order tracking.
            </p>
            <div className="hero-actions">
              <button className="primary-pill-btn" onClick={() => {
                const el = document.getElementById('catalog-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}>
                <ShoppingBag size={16} /> Explore Products
              </button>
              <button className="secondary-pill-btn" onClick={() => onAskAI('What products do you recommend in the Addis AI store?')}>
                <Bot size={16} /> Ask Addis AI for Recommendations
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-card-preview">
              <img
                src="https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80"
                alt="Yirgacheffe Coffee"
                className="preview-img"
              />
              <div className="preview-floating-badge">
                <Sparkles size={13} /> Roasted in Addis Ababa
              </div>
              <div className="preview-caption">
                <strong>Yirgacheffe Special Reserve</strong>
                <span>1,250 ETB · Floral & Bergamot Notes</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. CATALOG VIEW */}
      {activeTab === 'shop' && (
        <section id="catalog-section" className="catalog-wrapper">
          {/* Filter Bar */}
          <div className="catalog-filters">
            <div className="category-pills">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="catalog-search">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search coffee, electronics, leather..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="store-loading">
              <RefreshCw size={24} className="spin-icon" />
              <span>Loading authentic products…</span>
            </div>
          ) : products.length === 0 ? (
            <div className="store-empty">
              <Package size={36} />
              <h3>No products found</h3>
              <p>Try searching with another keyword or select "All".</p>
              <button className="text-link-btn" onClick={() => { setSearchQuery(''); setSelectedCategory('All') }}>
                Reset filters
              </button>
            </div>
          ) : (
            <div className="product-grid">
              {products.map(product => {
                const inCartItem = cart.find(item => item.product.id === product.id)
                return (
                  <div className="product-card" key={product.id}>
                    <div className="product-img-box" onClick={() => setSelectedProduct(product)}>
                      <img src={product.image_url} alt={product.name} loading="lazy" />
                      <span className="product-cat-tag">{product.category}</span>
                      <div className="product-overlay-action">
                        <span>Quick View</span>
                      </div>
                    </div>

                    <div className="product-body">
                      <div className="product-meta-row">
                        <div className="product-rating">
                          <Star size={13} fill="#f59e0b" color="#f59e0b" />
                          <span>{product.rating}</span>
                        </div>
                        <span className="stock-tag">In Stock ({product.stock})</span>
                      </div>

                      <h3 className="product-title" onClick={() => setSelectedProduct(product)}>
                        {product.name}
                      </h3>
                      <p className="product-desc">{product.description}</p>

                      <div className="product-footer">
                        <div className="product-price">
                          <strong>{product.price.toLocaleString()}</strong>
                          <small>ETB</small>
                        </div>

                        <div className="product-card-actions">
                          <button
                            className="btn-ask-ai"
                            title="Ask Addis AI about this product"
                            onClick={() => onAskAI(`Tell me details about ${product.name}, its specifications, and availability.`)}
                          >
                            <Bot size={15} />
                            <span>Ask AI</span>
                          </button>

                          <button
                            className={`btn-add-cart ${inCartItem ? 'in-cart' : ''}`}
                            onClick={() => addToCart(product)}
                            title="Add item to shopping cart"
                          >
                            {inCartItem ? (
                              <>
                                <Check size={14} />
                                <span>({inCartItem.quantity})</span>
                              </>
                            ) : (
                              <>
                                <Plus size={14} />
                                <span>Add</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. ORDERS VIEW */}
      {activeTab === 'orders' && (
        <section className="orders-wrapper">
          <div className="orders-header">
            <div>
              <h2>Your Order History</h2>
              <p>Track delivery, view items, and ask the AI assistant for instant updates.</p>
            </div>
            {profile && (
              <button
                className="ai-track-all-btn"
                onClick={() => onAskAI('Please summarize all my active orders and their delivery dates.')}
              >
                <Bot size={16} /> Track All Orders with AI
              </button>
            )}
          </div>

          {!profile ? (
            <div className="login-prompt-box">
              <User size={36} />
              <h3>Sign in to see your orders</h3>
              <p>Register or sign in with your email or phone to view your order history.</p>
              <button className="primary-pill-btn" onClick={() => setRegModalOpen(true)}>
                Sign In / Register
              </button>
            </div>
          ) : loadingOrders ? (
            <div className="store-loading">
              <RefreshCw size={24} className="spin-icon" />
              <span>Fetching your order records…</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="store-empty">
              <Package size={36} />
              <h3>No orders placed yet</h3>
              <p>Items you purchase will appear here with live delivery status.</p>
              <button className="primary-pill-btn" onClick={() => setActiveTab('shop')}>
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="orders-list">
              {orders.map(order => (
                <div className="order-card" key={order.order_number}>
                  <div className="order-card-top">
                    <div>
                      <div className="order-number-row">
                        <strong>Order {order.order_number}</strong>
                        <span className={`order-status-badge ${order.status}`}>{order.status}</span>
                      </div>
                      <small className="order-date">
                        Placed on {new Date(order.updated_at).toLocaleDateString()} · Payment: {order.payment_method || 'Telebirr'}
                      </small>
                    </div>

                    <button
                      className="order-ai-action-btn"
                      onClick={() => onAskAI(`What is the delivery status of order ${order.order_number}?`)}
                    >
                      <Bot size={15} /> Check with AI
                    </button>
                  </div>

                  <div className="order-items-list">
                    {order.items.map((item, idx) => (
                      <div className="order-item-row" key={idx}>
                        <div className="order-item-name">
                          <CheckCircle2 size={15} className="item-dot" />
                          <span>{item.name}</span>
                        </div>
                        <span className="order-item-qty">x{item.quantity}</span>
                        {item.price && <span className="order-item-price">{(item.price * item.quantity).toLocaleString()} ETB</span>}
                      </div>
                    ))}
                  </div>

                  <div className="order-card-foot">
                    <div className="order-shipping-meta">
                      <Truck size={14} />
                      <span>
                        {order.carrier || 'Addis Express'} · Delivery est:{' '}
                        <strong>{order.estimated_delivery || 'Calculating…'}</strong>
                      </span>
                    </div>
                    {order.total_amount && (
                      <div className="order-total-sum">
                        Total: <strong>{order.total_amount.toLocaleString()} ETB</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 4. PROFILE VIEW */}
      {activeTab === 'profile' && (
        <section className="profile-wrapper">
          <div className="profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {profile?.full_name?.slice(0, 1)?.toUpperCase() || 'A'}
              </div>
              <div>
                <h2>{profile?.full_name || 'Customer Account'}</h2>
                <p>{profile?.email || profile?.phone || 'Not signed in'}</p>
              </div>
            </div>

            <div className="profile-details-grid">
              <div className="profile-detail-item">
                <span className="label">Full Name</span>
                <strong>{profile?.full_name || '—'}</strong>
              </div>
              <div className="profile-detail-item">
                <span className="label">Email Address</span>
                <strong>{profile?.email || '—'}</strong>
              </div>
              <div className="profile-detail-item">
                <span className="label">Phone Number</span>
                <strong>{profile?.phone || '—'}</strong>
              </div>
              <div className="profile-detail-item">
                <span className="label">Preferred Language</span>
                <strong>{profile?.preferred_language?.toUpperCase() || language.toUpperCase()}</strong>
              </div>
            </div>

            <div className="profile-actions-row">
              <button className="primary-pill-btn" onClick={() => setRegModalOpen(true)}>
                Edit Profile
              </button>
              <button
                className="secondary-pill-btn"
                onClick={() => onAskAI('Please show what customer information you have saved on my profile.')}
              >
                <Bot size={16} /> Ask AI to Verify Profile
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 5. PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="product-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedProduct(null)}>
              <X size={20} />
            </button>
            <div className="product-modal-grid">
              <div className="modal-img-wrap">
                <img src={selectedProduct.image_url} alt={selectedProduct.name} />
              </div>
              <div className="modal-info-wrap">
                <span className="modal-cat-tag">{selectedProduct.category}</span>
                <h2>{selectedProduct.name}</h2>
                <div className="modal-rating-row">
                  <Star size={15} fill="#f59e0b" color="#f59e0b" />
                  <strong>{selectedProduct.rating}</strong>
                  <span>(Customer Verified)</span>
                  <span className="in-stock-label">In Stock ({selectedProduct.stock} available)</span>
                </div>
                <div className="modal-price-box">
                  <strong>{selectedProduct.price.toLocaleString()}</strong>
                  <span>ETB</span>
                </div>
                <p className="modal-desc">{selectedProduct.description}</p>

                <div className="modal-perks">
                  <div><Truck size={14} /> Express delivery in Ethiopia (2-3 days)</div>
                  <div><ShieldCheck size={14} /> 30-day money-back guarantee & authentic origin</div>
                  <div><Zap size={14} /> Full RAG AI support available in 4 languages</div>
                </div>

                <div className="modal-buttons-row">
                  <button
                    className="modal-add-cart-btn"
                    onClick={() => {
                      addToCart(selectedProduct)
                      setSelectedProduct(null)
                      setCartOpen(true)
                    }}
                  >
                    <ShoppingBag size={17} /> Add to Cart
                  </button>
                  <button
                    className="modal-ask-ai-btn"
                    onClick={() => {
                      setSelectedProduct(null)
                      onAskAI(`Tell me more about the ${selectedProduct.name}, its specifications, and return policy.`)
                    }}
                  >
                    <Bot size={17} /> Ask Addis AI
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. CART SLIDE-OVER DRAWER */}
      {cartOpen && (
        <div className="drawer-backdrop" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">
                <ShoppingBag size={19} />
                <h3>Your Shopping Cart</h3>
                <span className="cart-count-pill">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
              </div>
              <button className="icon-button" onClick={() => setCartOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <div className="drawer-body">
              {cart.length === 0 ? (
                <div className="cart-empty-state">
                  <ShoppingBag size={42} />
                  <h4>Your cart is empty</h4>
                  <p>Browse our catalog of authentic Ethiopian coffees, crafts, and electronics.</p>
                  <button className="primary-pill-btn" onClick={() => setCartOpen(false)}>
                    Browse Products
                  </button>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map(item => (
                    <div className="cart-item-row" key={item.product.id}>
                      <img src={item.product.image_url} alt={item.product.name} className="cart-item-thumb" />
                      <div className="cart-item-info">
                        <strong>{item.product.name}</strong>
                        <span className="cart-item-unit-price">{item.product.price.toLocaleString()} ETB</span>
                        <div className="cart-item-qty-row">
                          <button className="qty-btn" onClick={() => updateQuantity(item.product.id, -1)}>
                            <Minus size={12} />
                          </button>
                          <span>{item.quantity}</span>
                          <button className="qty-btn" onClick={() => updateQuantity(item.product.id, 1)}>
                            <Plus size={12} />
                          </button>
                          <button className="cart-remove-btn" onClick={() => removeFromCart(item.product.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="cart-item-subtotal">
                        {(item.product.price * item.quantity).toLocaleString()} ETB
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="drawer-footer">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{subtotal.toLocaleString()} ETB</strong>
                </div>
                <div className="summary-row">
                  <span>Shipping ({shippingFee === 0 ? 'Free over 2,000 ETB' : 'Standard Delivery'})</span>
                  <span>{shippingFee === 0 ? 'FREE' : `${shippingFee} ETB`}</span>
                </div>
                <div className="summary-total-row">
                  <strong>Total</strong>
                  <strong className="grand-price">{grandTotal.toLocaleString()} ETB</strong>
                </div>

                <button
                  className="checkout-btn"
                  onClick={() => {
                    setCartOpen(false)
                    setCheckoutOpen(true)
                  }}
                >
                  Proceed to Demo Checkout <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. DEMO CHECKOUT MODAL */}
      {checkoutOpen && (
        <div className="modal-backdrop" onClick={() => setCheckoutOpen(false)}>
          <div className="checkout-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setCheckoutOpen(false)}>
              <X size={20} />
            </button>

            {completedOrder ? (
              <div className="order-success-view">
                <div className="success-icon-badge">
                  <CheckCircle2 size={44} color="#16a34a" />
                </div>
                <h2>Order Confirmed!</h2>
                <div className="success-order-num">
                  Order Number: <strong>{completedOrder.order_number}</strong>
                </div>
                <p>
                  Thank you, <strong>{profile?.full_name}</strong>! Your demo payment via{' '}
                  <strong>{completedOrder.payment_method}</strong> was simulated successfully.
                </p>
                <div className="success-meta-card">
                  <div>
                    <span>Estimated Delivery:</span>
                    <strong>{completedOrder.estimated_delivery}</strong>
                  </div>
                  <div>
                    <span>Carrier:</span>
                    <strong>{completedOrder.carrier}</strong>
                  </div>
                  <div>
                    <span>Total Paid:</span>
                    <strong>{completedOrder.total_amount?.toLocaleString()} ETB</strong>
                  </div>
                </div>

                <div className="success-actions">
                  <button
                    className="track-with-ai-btn"
                    onClick={() => {
                      setCheckoutOpen(false)
                      setCompletedOrder(null)
                      onAskAI(`Please track my newly placed order ${completedOrder.order_number} and tell me the delivery details.`)
                    }}
                  >
                    <Bot size={18} /> Track with Addis AI Assistant
                  </button>
                  <button
                    className="secondary-pill-btn"
                    onClick={() => {
                      setCheckoutOpen(false)
                      setCompletedOrder(null)
                      setActiveTab('orders')
                    }}
                  >
                    View in My Orders
                  </button>
                </div>
              </div>
            ) : (
              <div className="checkout-form-container">
                <h2>Demo Checkout & Payment</h2>
                <p>Confirm your shipping details and select an Ethiopian payment method to simulate your order.</p>

                <div className="checkout-section">
                  <label className="input-label">Customer Profile
                    <input
                      type="text"
                      disabled
                      value={profile ? `${profile.full_name} (${profile.email || profile.phone})` : 'Guest'}
                    />
                  </label>
                  {!profile && (
                    <button className="inline-reg-btn" onClick={() => setRegModalOpen(true)}>
                      Sign in to associate order with your profile
                    </button>
                  )}
                </div>

                <div className="checkout-section">
                  <label className="input-label">Delivery Address in Ethiopia
                    <input
                      type="text"
                      value={shippingAddress}
                      onChange={e => setShippingAddress(e.target.value)}
                      placeholder="e.g. Bole Subcity, Woreda 03, Addis Ababa"
                    />
                  </label>
                </div>

                <div className="checkout-section">
                  <label className="input-label">Choose Payment Method (Demo Mode)</label>
                  <div className="payment-options-grid">
                    {[
                      { id: 'Telebirr', name: 'Telebirr', note: 'Fast Ethio Telecom Mobile Money', color: 'telebirr-opt' },
                      { id: 'CBE Birr', name: 'CBE Birr', note: 'Commercial Bank of Ethiopia', color: 'cbe-opt' },
                      { id: 'Demo Card', name: 'Credit / Debit Card', note: 'Visa / Mastercard Demo', color: 'card-opt' },
                      { id: 'Cash on Delivery', name: 'Cash on Delivery', note: 'Pay upon arrival in Addis Ababa', color: 'cod-opt' }
                    ].map(opt => (
                      <div
                        key={opt.id}
                        className={`payment-option-card ${paymentMethod === opt.id ? 'selected' : ''}`}
                        onClick={() => setPaymentMethod(opt.id as any)}
                      >
                        <div className="opt-radio">
                          {paymentMethod === opt.id && <div className="inner-dot" />}
                        </div>
                        <div className="opt-info">
                          <strong>{opt.name}</strong>
                          <small>{opt.note}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="checkout-summary-box">
                  <div className="summary-line">
                    <span>Items ({cart.length})</span>
                    <span>{subtotal.toLocaleString()} ETB</span>
                  </div>
                  <div className="summary-line">
                    <span>Delivery</span>
                    <span>{shippingFee === 0 ? 'FREE' : `${shippingFee} ETB`}</span>
                  </div>
                  <div className="summary-line total-line">
                    <strong>Total Amount</strong>
                    <strong className="total-highlight">{grandTotal.toLocaleString()} ETB</strong>
                  </div>
                </div>

                <button
                  className="pay-order-btn"
                  disabled={processingPayment || !shippingAddress.trim()}
                  onClick={handlePlaceOrder}
                >
                  {processingPayment ? (
                    <>
                      <RefreshCw size={17} className="spin-icon" />
                      <span>Simulating {paymentMethod} Payment…</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>Confirm Demo Payment ({grandTotal.toLocaleString()} ETB)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. REGISTER / PROFILE EDIT MODAL */}
      {regModalOpen && (
        <div className="modal-backdrop" onClick={() => setRegModalOpen(false)}>
          <div className="reg-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setRegModalOpen(false)}>
              <X size={20} />
            </button>
            <form onSubmit={handleRegister}>
              <div className="welcome-icon"><User size={22} /></div>
              <h2>Customer Profile</h2>
              <p>Save your contact details to connect orders, cart, and the Addis AI support assistant.</p>

              <label className="input-label">Full Name
                <input
                  required
                  maxLength={160}
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="e.g. Almaz Tadesse"
                />
              </label>

              <label className="input-label">Email Address
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="almaz@example.com"
                />
              </label>

              <div className="or-divider">or</div>

              <label className="input-label">Phone Number
                <input
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  placeholder="+251 91 123 4567"
                />
              </label>

              {regNotice && <div className="notice">{regNotice}</div>}

              <button className="primary-pill-btn w-full" disabled={regBusy}>
                {regBusy ? 'Saving Profile…' : 'Save & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

