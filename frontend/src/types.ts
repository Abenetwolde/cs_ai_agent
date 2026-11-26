export type Language = 'en' | 'am' | 'om' | 'ti'

export interface Profile {
  id: string
  full_name: string
  email?: string | null
  phone?: string | null
  preferred_language: Language
}

export interface Product {
  id: number
  name: string
  category: string
  price: number
  description: string
  image_url: string
  stock: number
  rating: number
}

export interface CartItem {
  cart_item_id?: number
  product: Product
  quantity: number
}

export interface OrderItem {
  name: string
  quantity: number
  price?: number
}

export interface Order {
  order_number: string
  status: string
  estimated_delivery?: string | null
  carrier?: string | null
  items: OrderItem[]
  total_amount?: number
  payment_method?: string | null
  shipping_address?: string | null
  updated_at: string
}

export interface SessionSummary {
  id: string
  status: string
  summary?: string | null
  updated_at: string
}

export interface SupportMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  sources?: string[]
  tools?: Array<{ tool: string; result: Record<string, any> }>
}

