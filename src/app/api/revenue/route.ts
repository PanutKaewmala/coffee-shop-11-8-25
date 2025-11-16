// app/api/revenue/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { OrderItem } from "@/lib/types";

function pad(n: number) {
    return String(n).padStart(2, "0");
}

/** format Date (local) => 'YYYY-MM-DD' */
function formatLocalDate(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Convert a local Date's start-of-day (midnight local) -> UTC ISO (instant)
 *  Example: local 2025-11-15 00:00 (Asia/Bangkok) -> "2025-11-14T17:00:00.000Z" (UTC)
 */
function localStartToUTCISO(local: Date) {
    const localStart = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0);
    return localStart.toISOString(); // gives the UTC instant of local midnight
}

/** Convert any timestamp/ISO (UTC) -> local 'YYYY-MM-DD' */
function utcIsoToLocalDate(iso: string) {
    const d = new Date(iso);
    return formatLocalDate(d);
}

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

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
    // Compute local start date (may be null for 'all')
    // -------------------------
    let startLocal: Date | null = null;
    if (range === "today") {
        startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range !== "all") {
        const days = RANGE_DAYS[range];
        const d = new Date(now);
        d.setDate(now.getDate() - (days - 1)); // include today
        d.setHours(0, 0, 0, 0);
        startLocal = d;
    }

    // -------------------------
    // Query DB (if startLocal present, filter using UTC ISO instant of local midnight)
    // -------------------------
    const query = supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: true });

    if (startLocal) {
        const utcISO = localStartToUTCISO(startLocal);
        query.gte("created_at", utcISO);
    }
    const { data: rawData, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(rawData) ? rawData as unknown[] : [];

    // -------------------------
    // Parse rows into typed objects
    // -------------------------
    type FormattedOrder = {
        id: string;
        created_at: string; // ISO (UTC)
        total: number;
        items: OrderItem[];
    };

    const formattedOrders: FormattedOrder[] = rows.map((r) => {
        const row = r as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
        // created_at in DB is timestamptz -> usually string ISO; fallback to Date.now
        const created_at = typeof row.created_at === "string"
            ? row.created_at
            : new Date(String(row.created_at ?? Date.now())).toISOString();
        const total = typeof row.total === "number" ? row.total : Number(row.total ?? 0);

        const rawItems = Array.isArray(row.order_items) ? row.order_items as unknown[] : [];
        const items: OrderItem[] = rawItems.map((it) => {
            const o = it as Record<string, unknown>;
            return {
                id: typeof o.id === "string" ? o.id : String(o.id ?? ""),
                name: typeof o.name === "string" ? o.name : String(o.name ?? ""),
                price: typeof o.price === "number" ? o.price : Number(o.price ?? 0),
                qty: typeof o.qty === "number" ? o.qty : Number(o.qty ?? 0),
            };
        });

        return { id, created_at, total, items };
    });

    // If range === 'all' and we didn't filter, set startLocal from earliest order
    if (range === "all" && formattedOrders.length > 0 && !startLocal) {
        const earliest = new Date(formattedOrders[0].created_at); // this is correct because ordered asc
        startLocal = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
    }

    // -------------------------
    // Summary numbers
    // -------------------------
    const totalRevenue = formattedOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalOrders = formattedOrders.length;
    const avgOrder = totalOrders === 0 ? 0 : Math.round(totalRevenue / totalOrders);

    // -------------------------
    // Top items
    // -------------------------
    const itemCount: Record<string, number> = {};
    formattedOrders.forEach((o) => {
        o.items.forEach((it) => {
            itemCount[it.name] = (itemCount[it.name] || 0) + (it.qty ?? 0);
        });
    });
    const topItems = Object.entries(itemCount)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    // -------------------------
    // Build bucket keys (local date strings) or hourly for today
    // -------------------------
    const bucket: Record<string, number> = {};

    if (range === "today") {
        for (let h = 0; h < 24; h++) {
            bucket[`${pad(h)}:00`] = 0;
        }
    } else {
        // if startLocal exists, iterate local days from startLocal -> today (local)
        if (startLocal) {
            const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            for (let d = new Date(startLocal); d <= endLocal; d.setDate(d.getDate() + 1)) {
                // formatLocalDate uses local timezone values
                bucket[formatLocalDate(new Date(d))] = 0;
            }
        }
    }

    // -------------------------
    // Fill bucket totals: convert each order's UTC created_at -> local day key
    // -------------------------
    for (const o of formattedOrders) {
        const localKey = utcIsoToLocalDate(o.created_at);
        if (range === "today") {
            const dt = new Date(o.created_at);
            const hourKey = `${pad(dt.getHours())}:00`;
            if (bucket[hourKey] !== undefined) bucket[hourKey] += o.total;
        } else {
            if (bucket[localKey] !== undefined) bucket[localKey] += o.total;
        }
    }

    // Convert bucket -> array (ascending)
    const chart = Object.entries(bucket)
        .map(([label, value]) => ({ label, value }));

    return NextResponse.json({
        range,
        totalRevenue,
        totalOrders,
        avgOrder,
        topItems,
        chart,
        orders: formattedOrders,
    });
}
