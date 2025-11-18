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
 * Contact
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

/** -------------------------
 * Branch
 * ------------------------- */
export interface Branch {
  id: string;
  name: string;
  address: string;
  phone?: string | null;
  map_url?: string | null;
  opening_hours?: string | null;
  is_primary?: boolean;
  created_at?: string | null;
}

/** -------------------------
 * POS Order Items
 * ------------------------- */
export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

/** -------------------------
 * Order
 * ------------------------- */
export type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  created_at: string;
};

/** -------------------------
 * Order Detail
 * ------------------------- */
export interface OrderDetail {
  id: string;
  total: number;
  created_at: string;
  items: OrderItem[];
}

/** -------------------------
 * Revenue Summary
 * ------------------------- */
export interface RevenueTopItem {
  name: string;
  qty: number;
}

export interface RevenueChartPoint {
  label: string;
  value: number;
}

export interface RevenueSummary {
  range: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrder: number;
  topItems: RevenueTopItem[];
  orders: Order[];
  chart: RevenueChartPoint[];
}

/**
 * ใช้ใน Dashboard ตอน fetch ยังไม่เสร็จ
 * เพื่อให้ TS ไม่บ่น summary null
 */
export type RevenueSummaryNullable = RevenueSummary | null;

/** -------------------------
 * CountData
 * ------------------------- */
export interface CountData {
  menu: number;
  branch: number;
  news: number;
  contact: number;
}

/** -------------------------
 * Stock: Ingredients
 * ------------------------- */
export interface Ingredient {
  id: string;
  name: string;
  stock: number;      // จำนวนคงเหลือ
  unit: string;       // เช่น ml, g, ชิ้น
  updated_at?: string;
}

/** -------------------------
 * Stock Log (ใช้ตอนหักสต๊อก)
 * ------------------------- */
export interface StockLog {
  id: string;
  orderId: string;
  ingredientId: string;
  amount: number;     // ที่ใช้จริง
  created_at: string;
}

/** -------------------------
 * Stock: Ingredient Update Payload
 * ------------------------- */
export interface IngredientUpdatePayload {
  name?: string;
  stock?: number;
  unit?: string;
  updated_at?: string;
}

/** -------------------------
 * Stock: Recipes
 * ------------------------- */
export interface Recipe {
  id: string;
  menu_id: string;
  ingredient_id: string;
  quantity: number;
}

/** -------------------------
 * Stock History Row (JOIN จาก stock_logs + ingredients)
 * ------------------------- */
export interface StockRow {
  id: string;
  ingredient_id: string;
  amount: number;
  type: string;
  note: string | null;
  order_id: string | null;
  created_at: string;

  // ฟิลด์ใหม่
  before_stock: number | null;
  after_stock: number | null;

  ingredients?: {
    id: string;
    name: string;
    unit: string;
  };
}

/** -------------------------
 * Stock: Deduct (POS triggers)
 * ------------------------- */

export interface DeductStockItem {
  ingredient_id: string;
  quantity: number; // ใช้งานต่อ 1 แก้วจากสูตร
}
export interface DeductStockInput {
  order_id: string | null;
  items: {
    ingredient_id: string;
    quantity: number;  // ใช้ต่อแก้ว
    amount: number;    // จำนวนแก้ว
  }[];
  note?: string | null;
}
export interface DeductResult {
  ingredient_id: string;
  before_stock: number;
  deduct: number;
  after_stock: number;
}