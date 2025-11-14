// lib/types.ts

/** -------------------------
 * Hero Section
 * ------------------------- */
export interface HeroData {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  secondaryText: string;
  secondaryLink: string;
  signature: string;
  seasonal: string;
  imageUrl: string;
}

/** -------------------------
 * Menu Items
 * ------------------------- */
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  serveTypes: string[];
  image: string;
  description?: string;
}

/** -------------------------
 * Contact (snake_case ตาม Supabase)
 * ------------------------- */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at?: string | null;
}

/** -------------------------
 * News Items
 * ------------------------- */
export interface NewsItem {
  id: string;
  category: string;
  title: string;
  content: string;
  image_url?: string;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone?: string | null;
  map_url?: string | null;
  opening_hours?: string | null;
  is_primary?: boolean;   // ⭐ เพิ่มฟิลด์นี้ สำคัญมาก!
  created_at?: string | null;
}
