// app/api/revenue/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

/* =========================
   Helpers
========================= */
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** format Date (local) => 'YYYY-MM-DD' */
function formatLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Robust normalizer for timestamps coming from Postgres/Supabase. */
function normalizePgTimestampToUTCISO(ts: string): string {
  if (!ts) return new Date().toISOString();
  let s = ts.trim();

  const quick = Date.parse(s);
  if (!isNaN(quick)) return new Date(quick).toISOString();

  s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  s = s.replace(/(\.\d{3})\d+\b/, "$1");

  const tzMatch = s.match(/([+-]\d{2})(\d{2})?$/);
  if (tzMatch) {
    const hh = tzMatch[1];
    const mm = tzMatch[2] || "00";
    s = s.replace(/([+-]\d{2})(\d{2})?$/, `${hh}:${mm}`);
  } else if (!/[Zz]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s = `${s}Z`;
  }

  const parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed).toISOString();

  try {
    const coerced = new Date(String(ts));
    if (!isNaN(coerced.getTime())) return coerced.toISOString();
  } catch {
    // ignore
  }

  return new Date().toISOString();
}

/** Convert UTC ISO string → local date YYYY-MM-DD */
function utcIsoToLocalDate(iso: string) {
  const d = new Date(iso);
  return formatLocalDate(d);
}

/** Convert local-midnight → UTC ISO */
function localStartToUTCISO(local: Date) {
  const localStart = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0);
  return localStart.toISOString();
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";
type OrderStatus = "paid" | "cancelled" | "void" | "refunded";

type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  variant_label: string | null; // ✅ NEW (serve type label)
};

type RawOrderRow = {
  id: string;
  total: number | string | null;
  created_at: string | null;
  paid_at: string | null;
  status: OrderStatus | null;
  order_items: unknown[] | null;
};

type FormattedOrder = {
  id: string;
  created_at: string; // normalized ISO UTC
  paid_at: string | null; // normalized ISO UTC
  status: OrderStatus;
  total: number;
  items: OrderItem[];
};

type ChartPoint = { label: string; value: number };

type TopItem = { name: string; variant_label: string | null; qty: number };

type RevenueResponse = {
  range: RangeType;

  // ✅ summary aligned with Orders
  paidTotal: number;
  paidCount: number;

  cancelledTotal: number;
  cancelledCount: number;

  refundedTotal: number;
  refundedCount: number;

  voidTotal: number;
  voidCount: number;

  netTotal: number; // paid - refunded (you can refine later)
  aov: number; // paidTotal / paidCount (rounded)

  topItems: TopItem[];
  chart: ChartPoint[];

  // ✅ recent list (all statuses)
  orders: FormattedOrder[];
};

function statusOrPaid(s: unknown): OrderStatus {
  return s === "paid" || s === "cancelled" || s === "void" || s === "refunded" ? s : "paid";
}

function parseOrderItems(raw: unknown[]): OrderItem[] {
  const items: OrderItem[] = [];
  for (const it of raw) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;

    const id = o.id !== undefined ? String(o.id) : "";
    const name = o.name !== undefined ? String(o.name) : "";
    const price = toNumber(o.price, 0);
    const qty = toNumber(o.qty, 0);

    // ✅ pull variant_label if exists (serve type label)
    const variant_label = toStringOrNull(o.variant_label);

    items.push({ id, name, price, qty, variant_label });
  }
  return items;
}

/** bucket init */
function buildBucket(range: RangeType, startLocal: Date | null, now: Date): Record<string, number> {
  const bucket: Record<string, number> = {};

  if (range === "today") {
    for (let h = 0; h < 24; h++) bucket[`${pad(h)}:00`] = 0;
    return bucket;
  }

  if (!startLocal) return bucket;

  const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let d = new Date(startLocal); d <= endLocal; d.setDate(d.getDate() + 1)) {
    bucket[formatLocalDate(new Date(d))] = 0;
  }
  return bucket;
}

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") || "today") as RangeType;

    const now = new Date();

    const RANGE_DAYS: Record<Exclude<RangeType, "all">, number> = {
      today: 1,
      week: 7,
      month: 30,
      year: 365,
      "5year": 5 * 365,
    };

    // -------------------------
    // Compute startLocal (local)
    // -------------------------
    let startLocal: Date | null = null;

    if (range === "today") {
      startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range !== "all") {
      const days = RANGE_DAYS[range];
      const d = new Date(now);
      d.setDate(now.getDate() - (days - 1));
      d.setHours(0, 0, 0, 0);
      startLocal = d;
    }

    const startUTCISO = startLocal ? localStartToUTCISO(startLocal) : null;

    // -------------------------
    // Query DB (2 streams)
    // 1) paidRows for revenue/chart/topItems -> based on paid_at
    // 2) allRows for recent orders list -> based on created_at
    // -------------------------
    let paidQuery = supabase
      .from("orders")
      .select("id,total,created_at,paid_at,status,order_items(id,name,price,qty,variant_label)")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .range(0, 99999);

    if (startUTCISO) paidQuery = paidQuery.gte("paid_at", startUTCISO);

    let allQuery = supabase
      .from("orders")
      .select("id,total,created_at,paid_at,status,order_items(id,name,price,qty,variant_label)")
      .order("created_at", { ascending: false })
      .range(0, 200); // recent enough for dashboard

    if (startUTCISO) allQuery = allQuery.gte("created_at", startUTCISO);

    const [{ data: paidRaw, error: paidErr }, { data: allRaw, error: allErr }] = await Promise.all([
      paidQuery,
      allQuery,
    ]);

    if (paidErr) return NextResponse.json({ error: paidErr.message }, { status: 500 });
    if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });

    const paidRows = (Array.isArray(paidRaw) ? paidRaw : []) as unknown[];
    const allRows = (Array.isArray(allRaw) ? allRaw : []) as unknown[];

    const parseRow = (r: unknown): FormattedOrder => {
      const row = (typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {}) as Record<
        string,
        unknown
      >;

      const id = row.id !== undefined ? String(row.id) : "";

      const createdRaw = row.created_at ? String(row.created_at) : "";
      const paidRawAt = row.paid_at ? String(row.paid_at) : "";

      const created_at = createdRaw ? normalizePgTimestampToUTCISO(createdRaw) : new Date().toISOString();
      const paid_at = paidRawAt ? normalizePgTimestampToUTCISO(paidRawAt) : null;

      const status = statusOrPaid(row.status);

      const total = toNumber(row.total, 0);

      const rawItems = Array.isArray(row.order_items) ? (row.order_items as unknown[]) : [];
      const items = parseOrderItems(rawItems);

      return { id, created_at, paid_at, status, total, items };
    };

    const paidOrders: FormattedOrder[] = paidRows.map(parseRow);
    const allOrders: FormattedOrder[] = allRows.map(parseRow);

    // -------------------------
    // If "all" and startLocal not set, derive startLocal from earliest paid order (for chart axis)
    // -------------------------
    if (range === "all" && paidOrders.length > 0 && !startLocal) {
      const last = paidOrders[paidOrders.length - 1];
      const dt = new Date(last.paid_at ?? last.created_at);
      startLocal = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }

    // -------------------------
    // Summary aligned with Orders
    // -------------------------
    const paidTotal = paidOrders.reduce((s, o) => s + o.total, 0);
    const paidCount = paidOrders.length;

    const cancelledOrders = allOrders.filter((o) => o.status === "cancelled");
    const refundedOrders = allOrders.filter((o) => o.status === "refunded");
    const voidOrders = allOrders.filter((o) => o.status === "void");

    const cancelledTotal = cancelledOrders.reduce((s, o) => s + o.total, 0);
    const refundedTotal = refundedOrders.reduce((s, o) => s + o.total, 0);
    const voidTotal = voidOrders.reduce((s, o) => s + o.total, 0);

    const cancelledCount = cancelledOrders.length;
    const refundedCount = refundedOrders.length;
    const voidCount = voidOrders.length;

    // ✅ simple net (refine later if you implement partial refund)
    const netTotal = paidTotal - refundedTotal;

    const aov = paidCount > 0 ? Math.round(paidTotal / paidCount) : 0;

    // -------------------------
    // Top items from PAID only (group by name + variant_label)
    // -------------------------
    const itemCount = new Map<string, TopItem>();

    for (const o of paidOrders) {
      for (const it of o.items) {
        const name = (it.name || "").trim();
        if (!name) continue;

        const qty = toNumber(it.qty, 0);
        if (qty <= 0) continue;

        const variant_label = it.variant_label ? it.variant_label : null;
        const key = `${name}__${variant_label ?? ""}`;

        const prev = itemCount.get(key);
        if (!prev) {
          itemCount.set(key, { name, variant_label, qty });
        } else {
          prev.qty += qty;
        }
      }
    }

    const topItems: TopItem[] = Array.from(itemCount.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // -------------------------
    // Build bucket + fill (PAID only, use paid_at)
    // -------------------------
    const bucket = buildBucket(range, startLocal, now);

    for (const o of paidOrders) {
      const keyISO = o.paid_at ?? o.created_at;

      if (range === "today") {
        const dt = new Date(keyISO);
        const hourKey = `${pad(dt.getHours())}:00`;
        if (bucket[hourKey] !== undefined) bucket[hourKey] += o.total;
      } else {
        const localKey = utcIsoToLocalDate(keyISO);
        if (bucket[localKey] !== undefined) bucket[localKey] += o.total;
      }
    }

    const chart: ChartPoint[] = Object.entries(bucket).map(([label, value]) => ({ label, value }));

    const out: RevenueResponse = {
      range,

      paidTotal,
      paidCount,

      cancelledTotal,
      cancelledCount,

      refundedTotal,
      refundedCount,

      voidTotal,
      voidCount,

      netTotal,
      aov,

      topItems,
      chart,

      orders: allOrders, // recent (all statuses)
    };

    return NextResponse.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load revenue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
