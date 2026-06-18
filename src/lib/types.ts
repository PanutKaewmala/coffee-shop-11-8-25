// lib/types.ts
// ✅ Single source of truth + backward compatible aliases
import type { Tables, Enums } from "@/lib/database.types";

/* =========================
   Primitives
========================= */
export type UUID = string;

/* =========================
   DB Row Types (Supabase)
========================= */
export type BranchRow = Tables<"branch">;
export type ContactRow = Tables<"contact">;
export type IngredientRow = Tables<"ingredients">;

export type MenuRow = Tables<"menu">;
export type MenuCategoryRow = Tables<"menu_categories">;
export type ServeRow = Tables<"menu_serve_types">;
export type MenuServeRow = Tables<"menu_serves">;
export type MenuVariantRow = Tables<"menu_variants">;

export type NewsRow = Tables<"news">;
export type HeroRow = Tables<"hero">;

export type OrderRow = Tables<"orders">;
export type OrderItemRow = Tables<"order_items">;

export type RecipeRow = Tables<"recipes">;
export type RecipeItemRow = Tables<"recipe_items">;

export type StockLogRow = Tables<"stock_logs">;

/* =========================
   Enums
========================= */
export type ContactCategory = Enums<"contact_category">;

/* =========================
   Hero (API shape)
========================= */
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

/* =========================
   Serve Types
========================= */
export type ServeTypeWithDefault = {
  id: string;
  name: string;
  is_default?: boolean;
};

/* =========================
   Menu (App-level shape)
========================= */
export type MenuWithRelations = {
  id: string;
  name: string;
  price: number;

  // UI/admin ใช้ชื่อหมวด (ไม่ใช่ object)
  category: string | null;

  image_url: string | null;
  description: string | null;

  // legacy support
  serve_types: string[] | ServeTypeWithDefault[];
  is_enabled_in_branch?: boolean;

  created_at?: string | null;
};

/* =========================
   Orders (POS / history)
========================= */
export type OrderStatus = "paid" | "void" | "refunded";
export type PaymentMethod = "cash" | "promptpay";

/**
 * ✅ UI/POS-friendly item shape
 * - รองรับ variant_label เพื่อแก้ปัญหา “ชื่อเดียวกันแต่ราคาต่าง”
 * - optional: serve_type_id/size เผื่ออนาคตทำ filter/sort/summary
 */
export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;

  menu_id?: string | null;
  variant_id?: string | null;

  // ✅ new
  variant_label?: string | null;

  // ✅ optional future-proof
  serve_type_id?: string | null;
  size?: string | null;
};

export type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  created_at: string;

  status?: OrderStatus;
  payment_method?: PaymentMethod;
  paid_amount?: number | null;
  change_amount?: number | null;
  paid_at?: string | null;
  note?: string | null;
};

export interface OrderDetail {
  id: string;
  total: number;
  created_at: string;
  items: OrderItem[];

  status?: OrderStatus;
  payment_method?: PaymentMethod;
  paid_amount?: number | null;
  change_amount?: number | null;
  paid_at?: string | null;
  note?: string | null;
}

/* =========================
   Revenue Types
========================= */
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
export type RevenueSummaryNullable = RevenueSummary | null;

export interface CountData {
  menu: number;
  branch: number;
  news: number;
  contact: number;
}

/* =========================
   Stock / Ingredient (UI-friendly)
========================= */

/**
 * ✅ Core unit for stock system (store in DB as base_unit)
 * - ของเหลว: ml
 * - ผง/เมล็ด: g
 * - ของชิ้น: piece
 */
export type BaseUnit = "ml" | "g" | "piece";

/**
 * ✅ Archive state columns (DB: is_active, archived_at)
 * ใช้ร่วมกันใน UI / API payload ได้
 */
export type IngredientArchiveState = {
  is_active: boolean;
  archived_at: string | null;
};

export type Ingredient = {
  id: UUID;
  name: string;
  stock: number;

  // ✅ new core
  base_unit: BaseUnit;

  // legacy support (อย่าใช้เป็นแกนแล้ว)
  unit?: string | null;

  updated_at?: string | null;

  category?: string | null;
  cost_per_unit?: number | null;

  // ✅ archive
  is_active: boolean;
  archived_at: string | null;
};

/**
 * ✅ Update payload used by API routes
 * base_unit: ห้าม null
 * unit: legacy (ถ้ายังมี client เก่า)
 *
 * ✅ เพิ่ม is_active / archived_at เพื่อทำ soft-delete / archived screen
 */
export type IngredientUpdatePayload = {
  name?: string;
  stock?: number;

  // ✅ new
  base_unit?: BaseUnit;

  // legacy (แนะนำเลิกใช้)
  unit?: string;

  category?: string | null;
  cost_per_unit?: number | null;

  // ✅ archive
  is_active?: boolean;
  archived_at?: string | null;

  updated_at?: string | null;
};

/**
 * ✅ (Optional) payload ชัด ๆ สำหรับ Archive action
 * เอาไว้ใช้ใน /api/ingredients/archive หรือ PUT ก็ได้ แต่แยกไว้กันมั่ว
 */
export type IngredientArchivePayload = {
  id: UUID;
  is_active: false;
  archived_at: string;
};

export type Recipe = {
  id: string;
  menu_id: string;
  ingredient_id: string;
  quantity: number;
};

export type StockRow = StockLogRow & {
  ingredients?: {
    id: string;
    name: string;

    // ✅ new core
    base_unit: BaseUnit;

    // legacy fallback
    unit?: string | null;

    // ✅ archive (optional เพราะ join บางที่อาจไม่ได้ select)
    is_active?: boolean;
    archived_at?: string | null;
  };
};

export interface DeductStockItem {
  ingredient_id: string;
  quantity: number;
}
export interface DeductStockInput {
  order_id: string | null;
  items: {
    ingredient_id: string;
    quantity: number;
    amount: number;
  }[];
  note?: string | null;
}
export interface DeductResult {
  ingredient_id: string;
  before_stock: number;
  deduct: number;
  after_stock: number;
}

/* =========================
   News Types
========================= */

/**
 * ✅ ใช้จาก DB row โดยตรง (ถ้า category ใน DB เป็น nullable ก็ทำ NonNullable ให้ใช้ใน filter UI)
 */
export type NewsCategory = NonNullable<NewsRow["category"]>;

/**
 * ✅ เลิกเล่น conditional key เพราะ TS งอแงกับ Supabase types
 * ถ้าคุณมี enum/status จริงใน DB ค่อยมา map เพิ่มทีหลัง
 */
export type NewsStatus = "draft" | "published" | "archived";

/* =========================
   Shared UI Types
========================= */
export type PaginationProps = {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  inputPage: string;
  setInputPage: (v: string) => void;
};

/* =========================
   POS Types
========================= */
export type PosCheckoutPayload = {
  items: { variant_id: string; qty: number }[];
  branch_id?: string;

  // ✅ new
  payment_method?: PaymentMethod;
  note?: string | null;
};

/* =========================
   🔥 Backward Compatible Aliases
========================= */
export type MenuItem = MenuWithRelations;
export type CategoryRow = MenuCategoryRow;

export type ContactMessage = ContactRow;
export type Branch = BranchRow;
export type NewsItem = NewsRow;

export type MenuAPIItem = {
  id: UUID;
  name: string;
  price: number;
  category?: string | null;
  serve_types?: string[] | ServeTypeWithDefault[];
  image_url?: string | null;
  description?: string | null;
  created_at?: string | null;
};

export type MenuAPIResponse = {
  menu?: MenuAPIItem[];
};

export type NewsPayload = {
  category: string;
  title: string;
  event_date: string;
  content: string | null;
  image: string | null;
};

// ✅ Fix: old name MenuDBRow used in some API routes
export type MenuDBRow = MenuRow;
