// app/api/revenue/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { OrderItem } from "@/lib/types";

function pad(n: number) {
    return String(n).padStart(2, "0");
}

/** format Date (local Bangkok) => 'YYYY-MM-DD' */
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

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

type OrderStatusUI = "paid" | "cancelled" | "void" | "refunded" | "unknown";
function normalizeStatus(v: unknown): OrderStatusUI {
    const s = typeof v === "string" ? v.toLowerCase().trim() : "";
    if (s === "paid") return "paid";
    if (s === "cancelled") return "cancelled";
    if (s === "void") return "void";
    if (s === "refunded") return "refunded";
    return "unknown";
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
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
    // Compute startLocal (Bangkok local)
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

    // -------------------------
    // Query DB (✅ include status)
    // -------------------------
    let query = supabase
        .from("orders")
        .select("id, total, created_at, status, order_items(*)")
        .order("created_at", { ascending: false })
        .range(0, 99999);

    if (startLocal) {
        const utcISO = localStartToUTCISO(startLocal);
        query = query.gte("created_at", utcISO);
    }

    const { data: rawData, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(rawData) ? rawData : [];

    // -------------------------
    // Parse rows -> formattedOrders
    // -------------------------
    type FormattedOrder = {
        id: string;
        created_at: string; // normalized ISO UTC
        total: number;
        status: OrderStatusUI;
        items: OrderItem[];
        raw_created_at?: string;
    };

    const formattedOrders: FormattedOrder[] = rows.map((r) => {
        const row = r as Record<string, unknown>;

        const rawCreated = row.created_at ? String(row.created_at) : "";
        const createdISO = rawCreated ? normalizePgTimestampToUTCISO(rawCreated) : new Date().toISOString();

        const total = toNumber(row.total, 0);
        const status = normalizeStatus(row.status);

        const rawItems = Array.isArray(row.order_items) ? (row.order_items as unknown[]) : [];
        const items: OrderItem[] = rawItems.map((it) => {
            const o = it as Record<string, unknown>;
            const id = o.id !== undefined ? String(o.id) : "";
            const name = o.name !== undefined ? String(o.name) : "";
            const price = toNumber(o.price, 0);
            const qty = toNumber(o.qty, 0);
            return { id, name, price, qty };
        });

        return {
            id: row.id !== undefined ? String(row.id) : "",
            total,
            status,
            created_at: createdISO,
            items,
            raw_created_at: rawCreated || undefined,
        };
    });

    // If "all" and startLocal not set, derive from earliest order
    if (range === "all" && formattedOrders.length > 0 && !startLocal) {
        const last = formattedOrders[formattedOrders.length - 1];
        const first = new Date(last.created_at);
        startLocal = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    }

    // -------------------------
    // Summary (✅ paid-only, owner-safe)
    // -------------------------
    const paidOrders = formattedOrders.filter((o) => o.status === "paid");
    const refundedOrders = formattedOrders.filter((o) => o.status === "refunded");
    const cancelledOrders = formattedOrders.filter((o) => o.status === "cancelled" || o.status === "void");
    const unknownOrders = formattedOrders.filter((o) => o.status === "unknown");

    const paidRevenue = paidOrders.reduce((s, o) => s + o.total, 0);
    const refundedTotal = refundedOrders.reduce((s, o) => s + o.total, 0);
    const netRevenue = paidRevenue - refundedTotal;

    const totalOrders = paidOrders.length; // paid-only
    const avgOrder = totalOrders ? Math.round(paidRevenue / totalOrders) : 0;

    const cancelledCount = cancelledOrders.length;
    const cancelledTotal = cancelledOrders.reduce((s, o) => s + o.total, 0);

    // Top items (✅ paid-only)
    const itemCount: Record<string, number> = {};
    paidOrders.forEach((o) => {
        o.items.forEach((it) => {
            itemCount[it.name] = (itemCount[it.name] || 0) + (it.qty ?? 0);
        });
    });

    const topItems = Object.entries(itemCount)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    // -------------------------
    // Build bucket (✅ paid-only)
    // -------------------------
    const bucket: Record<string, number> = {};

    if (range === "today") {
        for (let h = 0; h < 24; h++) bucket[`${pad(h)}:00`] = 0;
    } else if (startLocal) {
        const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        for (let d = new Date(startLocal); d <= endLocal; d.setDate(d.getDate() + 1)) {
            bucket[formatLocalDate(new Date(d))] = 0;
        }
    }

    for (const o of paidOrders) {
        if (range === "today") {
            const dt = new Date(o.created_at);
            const hourKey = `${pad(dt.getHours())}:00`;
            if (bucket[hourKey] !== undefined) bucket[hourKey] += o.total;
        } else {
            const localKey = utcIsoToLocalDate(o.created_at);
            if (bucket[localKey] !== undefined) bucket[localKey] += o.total;
        }
    }

    const chart = Object.entries(bucket).map(([label, value]) => ({ label, value }));

    return NextResponse.json({
        range,

        // backward-compatible names (dashboard uses these)
        totalRevenue: paidRevenue,
        totalOrders,
        avgOrder,
        topItems,
        chart,

        // ✅ extra fields (optional)
        netRevenue,
        refundedTotal,
        cancelledCount,
        cancelledTotal,
        unknownCount: unknownOrders.length,

        // orders (include status so UI can filter later if needed)
        orders: formattedOrders,
    });
}
