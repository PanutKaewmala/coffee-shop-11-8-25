// hooks/useStockSearch.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

/* =========================
   Types (API vs UI)
========================= */
type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

// Backend อาจส่ง type เพิ่มมาได้
type ApiStockLogType =
    | "deduct"
    | "add"
    | "adjust"
    | "delete"
    | "set"
    | "increase"
    | "decrease"
    | "loss"
    | string;

// UI เราโชว์แค่ 3 กลุ่มหลัก (ง่าย + เจ้าของร้านเข้าใจ)
export type StockLogType = "deduct" | "add" | "adjust";

type UnitKey = "g" | "ml" | "piece" | "unknown";

type OrderMenuLine = {
    order_item_id: string;
    menu_id: string | null;
    variant_id: string | null;

    menu_name: string;
    serve_type: string | null;
    size: string | null;

    qty: number;
    price: number;
};

export type StockEvent = {
    event_id: string;
    happened_at: string;
    type: StockLogType; // ✅ normalized for UI
    order_id: string | null;

    title: string;
    subtitle: string | null;
    note: string | null;

    items_count: number;
    impact_by_unit: Record<UnitKey, number>;

    flags: {
        manual_adjust: boolean;
        has_big_amount: boolean;
    };

    items: Array<{
        id: string;
        ingredient_id: string;
        ingredient_name: string | null;
        unit: string | null;
        base_unit?: string | null;
        amount: number;
        delta: number | null;
        before_stock: number | null;
        after_stock: number | null;
        flags: { big_amount: boolean };
    }>;

    order_menu_lines?: OrderMenuLine[];

    // computed for UI
    order_menu_hint?: string;
    order_menu_count?: number;
};

export type StockSummary = {
    total_events: number;
    total_items: number;
    events_by_type: Record<string, number | null>;
    items_by_type: Record<string, number | null>;
    impact_by_unit: Record<UnitKey, number>;
};

type ApiEventsResponse = {
    summary: StockSummary;
    events: StockEvent[];
    meta?: unknown;
};

export type KpiSummary = {
    range: { from: string | null; to: string | null };
    events_count: number;
    critical_count: number;
    inflow: Record<UnitKey, number>;
    outflow: Record<UnitKey, number>;
    by_type: Record<StockLogType, number>;
};

export type CriticalItem = {
    ingredient_id: string;
    name: string;
    base_unit: string; // ml/g/piece
    display_unit: string | null;
    current_stock: number;
    min_stock: number;
    status: "out" | "low" | "ok";
};

type CriticalResponse = {
    critical_count: number;
    items: CriticalItem[];
};

/* =========================
   Safe helpers (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function readString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}
function readNumber(v: unknown): number | null {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function readBool(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}
function readArray(v: unknown): unknown[] | null {
    return Array.isArray(v) ? v : null;
}

function emptyImpact(): Record<UnitKey, number> {
    return { g: 0, ml: 0, piece: 0, unknown: 0 };
}

function emptySummary(): StockSummary {
    return {
        total_events: 0,
        total_items: 0,
        events_by_type: { deduct: 0, add: 0, adjust: 0 },
        items_by_type: { deduct: 0, add: 0, adjust: 0 },
        impact_by_unit: emptyImpact(),
    };
}

function emptyKpi(): KpiSummary {
    return {
        range: { from: null, to: null },
        events_count: 0,
        critical_count: 0,
        inflow: emptyImpact(),
        outflow: emptyImpact(),
        by_type: { deduct: 0, add: 0, adjust: 0 },
    };
}

/* =========================
   Normalizers
========================= */
// ✅ ทำให้ type ฝั่ง UI “นิ่ง” แม้ backend จะเพิ่ม type ใหม่
function normalizeType(t: ApiStockLogType): StockLogType | null {
    // กลุ่ม “ออก”
    if (t === "deduct" || t === "decrease" || t === "loss") return "deduct";
    // กลุ่ม “เข้า”
    if (t === "add" || t === "increase") return "add";
    // กลุ่ม “ปรับ”
    if (t === "adjust" || t === "set") return "adjust";

    // delete หรือ type แปลก ๆ → ไม่โชว์ timeline
    return null;
}

function normalizeUnitKey(u: unknown): UnitKey {
    const s = (typeof u === "string" ? u : "").toLowerCase().trim();
    if (s === "g") return "g";
    if (s === "ml") return "ml";
    if (s === "piece") return "piece";
    return "unknown";
}

function normalizeImpact(v: unknown): Record<UnitKey, number> {
    // backend ส่งมาแบบ {g, ml, piece, unknown} อยู่แล้วส่วนใหญ่
    if (isRecord(v)) {
        const g = readNumber(v.g) ?? 0;
        const ml = readNumber(v.ml) ?? 0;
        const piece = readNumber(v.piece) ?? 0;
        const unknown = readNumber(v.unknown) ?? 0;
        return { g, ml, piece, unknown };
    }
    return emptyImpact();
}

function normalizeFlags(v: unknown): { manual_adjust: boolean; has_big_amount: boolean } {
    if (!isRecord(v)) return { manual_adjust: false, has_big_amount: false };
    return {
        manual_adjust: Boolean(readBool(v.manual_adjust) ?? false),
        has_big_amount: Boolean(readBool(v.has_big_amount) ?? false),
    };
}

function menuLineLabel(l: OrderMenuLine): string {
    const parts: string[] = [];
    if (l.serve_type) parts.push(l.serve_type);
    if (l.size && l.size !== "default") parts.push(l.size);
    const tail = parts.length ? ` (${parts.join(" / ")})` : "";
    return `${l.menu_name}${tail} x${l.qty}`;
}

function buildOrderMenuHint(
    lines: OrderMenuLine[] | undefined
): { hint: string | undefined; count: number } {
    if (!lines || lines.length === 0) return { hint: undefined, count: 0 };
    const shown = lines.slice(0, 2).map(menuLineLabel);
    const more = lines.length - shown.length;
    const hint = more > 0 ? `${shown.join(", ")} +${more} more` : shown.join(", ");
    return { hint, count: lines.length };
}

/* =========================
   Date range helper
========================= */
const BANGKOK_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";

function bangkokDateKey(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: BANGKOK_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function addDaysBangkok(dateKey: string, days: number): string {
    const d = new Date(`${dateKey}T00:00:00${BANGKOK_OFFSET}`);
    d.setDate(d.getDate() + days);
    return bangkokDateKey(d);
}

function monthStartKey(dateKey: string): string {
    return `${dateKey.slice(0, 7)}-01`;
}

function nextMonthStartKey(dateKey: string): string {
    const d = new Date(`${monthStartKey(dateKey)}T00:00:00${BANGKOK_OFFSET}`);
    d.setMonth(d.getMonth() + 1);
    return `${bangkokDateKey(d).slice(0, 7)}-01`;
}

function bangkokStartIso(dateKey: string): string {
    return `${dateKey}T00:00:00.000${BANGKOK_OFFSET}`;
}

function bangkokEndIso(dateKey: string): string {
    return `${dateKey}T23:59:59.999${BANGKOK_OFFSET}`;
}

function buildFromTo(filter: DateFilter): { from?: string; to?: string } {
    if (filter === "all") return {};
    const todayKey = bangkokDateKey(new Date());

    let startKey = todayKey;
    let endKey = todayKey;

    switch (filter) {
        case "today":
            break;
        case "yesterday":
            startKey = addDaysBangkok(todayKey, -1);
            endKey = startKey;
            break;
        case "7days":
            // Inclusive 7 calendar days (today + previous 6), aligned with Orders page.
            startKey = addDaysBangkok(todayKey, -6);
            endKey = todayKey;
            break;
        case "month":
            startKey = monthStartKey(todayKey);
            endKey = addDaysBangkok(nextMonthStartKey(todayKey), -1);
            break;
        default:
            break;
    }

    return { from: bangkokStartIso(startKey), to: bangkokEndIso(endKey) };
}

/* =========================
   Decoders (tolerant + safe)
========================= */
function decodeOrderMenuLines(v: unknown): OrderMenuLine[] | undefined {
    const arr = readArray(v);
    if (!arr) return undefined;

    const out: OrderMenuLine[] = [];
    for (const it of arr) {
        if (!isRecord(it)) continue;

        const order_item_id = readString(it.order_item_id);
        const menu_name = readString(it.menu_name);
        const qty = readNumber(it.qty);
        const price = readNumber(it.price);

        if (!order_item_id || !menu_name || qty == null || price == null) continue;

        out.push({
            order_item_id,
            menu_id: readString(it.menu_id),
            variant_id: readString(it.variant_id),
            menu_name,
            serve_type: readString(it.serve_type),
            size: readString(it.size),
            qty,
            price,
        });
    }

    return out.length ? out : undefined;
}

function decodeEventItems(v: unknown): StockEvent["items"] {
    const arr = readArray(v);
    if (!arr) return [];

    const out: StockEvent["items"] = [];
    for (const it of arr) {
        if (!isRecord(it)) continue;

        const id = readString(it.id);
        const ingredient_id = readString(it.ingredient_id);
        const amount = readNumber(it.amount);

        if (!id || !ingredient_id || amount == null) continue;

        const delta = readNumber(it.delta);
        const before_stock = readNumber(it.before_stock);
        const after_stock = readNumber(it.after_stock);

        const flags = isRecord(it.flags)
            ? { big_amount: Boolean(readBool(it.flags.big_amount) ?? false) }
            : { big_amount: false };

        out.push({
            id,
            ingredient_id,
            ingredient_name: readString(it.ingredient_name),
            unit: readString(it.unit),
            base_unit: readString(it.base_unit),
            amount,
            delta: delta == null ? null : delta,
            before_stock: before_stock == null ? null : before_stock,
            after_stock: after_stock == null ? null : after_stock,
            flags,
        });
    }

    return out;
}

function decodeStockEvent(v: unknown): StockEvent | null {
    if (!isRecord(v)) return null;

    const event_id = readString(v.event_id) ?? readString(v.eventId);
    const happened_at = readString(v.happened_at) ?? readString(v.happenedAt);
    const rawType = (readString(v.type) ?? "") as ApiStockLogType;
    const title = readString(v.title);

    if (!event_id || !happened_at || !title) return null;

    const type = normalizeType(rawType);
    if (!type) return null; // ✅ delete/loss แปลก ๆ ไม่โชว์

    const items = decodeEventItems(v.items);
    // event ไม่มี items ก็ยัง allow (บางระบบสรุปเป็น event)
    const items_count = readNumber(v.items_count) ?? items.length;

    const impact_by_unit = normalizeImpact(v.impact_by_unit);
    const flags = normalizeFlags(v.flags);

    const ev: StockEvent = {
        event_id,
        happened_at,
        type,
        order_id: readString(v.order_id),
        title,
        subtitle: readString(v.subtitle),
        note: readString(v.note),
        items_count,
        impact_by_unit,
        flags,
        items,
        order_menu_lines: decodeOrderMenuLines(v.order_menu_lines),
    };

    const { hint, count } = buildOrderMenuHint(ev.order_menu_lines);
    ev.order_menu_hint = hint;
    ev.order_menu_count = count;

    return ev;
}

function decodeEventsResponse(json: unknown): ApiEventsResponse | null {
    if (!isRecord(json)) return null;

    // ✅ summary เอาไว้โชว์ KPI/หัวการ์ด → อย่า strict
    const summaryRaw = isRecord(json.summary) ? json.summary : null;

    const summary: StockSummary = summaryRaw
        ? {
            total_events: readNumber(summaryRaw.total_events) ?? 0,
            total_items: readNumber(summaryRaw.total_items) ?? 0,
            events_by_type: isRecord(summaryRaw.events_by_type)
                ? (summaryRaw.events_by_type as Record<string, number | null>)
                : { deduct: 0, add: 0, adjust: 0 },
            items_by_type: isRecord(summaryRaw.items_by_type)
                ? (summaryRaw.items_by_type as Record<string, number | null>)
                : { deduct: 0, add: 0, adjust: 0 },
            impact_by_unit: normalizeImpact(summaryRaw.impact_by_unit),
        }
        : emptySummary();

    const eventsRaw = readArray(json.events);
    if (!eventsRaw) {
        return { summary, events: [], meta: "meta" in json ? json.meta : undefined };
    }

    // ✅ event ไหนพัง → skip (อย่าทิ้งทั้งหน้า)
    const events: StockEvent[] = [];
    for (const e of eventsRaw) {
        const ev = decodeStockEvent(e);
        if (ev) events.push(ev);
    }

    return {
        summary,
        events,
        meta: "meta" in json ? json.meta : undefined,
    };
}

/* ===== KPI / Critical decoders ===== */
function decodeKpi(json: unknown): KpiSummary | null {
    if (!isRecord(json)) return null;
    if (!isRecord(json.range)) return null;

    const from = ("from" in json.range) ? (readString(json.range.from) ?? null) : null;
    const to = ("to" in json.range) ? (readString(json.range.to) ?? null) : null;

    const events_count = readNumber(json.events_count);
    const critical_count = readNumber(json.critical_count);
    if (events_count == null || critical_count == null) return null;

    const inflow = normalizeImpact(json.inflow);
    const outflow = normalizeImpact(json.outflow);

    // backend อาจส่ง by_type แปลก ๆ → normalize แค่ 3 ตัว
    const bt = isRecord(json.by_type) ? json.by_type : {};
    const by_type: Record<StockLogType, number> = {
        deduct: readNumber((bt as Record<string, unknown>).deduct) ?? 0,
        add: readNumber((bt as Record<string, unknown>).add) ?? 0,
        adjust: readNumber((bt as Record<string, unknown>).adjust) ?? 0,
    };

    return {
        range: { from, to },
        events_count,
        critical_count,
        inflow,
        outflow,
        by_type,
    };
}

function decodeCritical(json: unknown): CriticalResponse | null {
    if (!isRecord(json)) return null;
    const cc = readNumber(json.critical_count);
    const itemsRaw = readArray(json.items);
    if (cc == null || !itemsRaw) return null;

    const items: CriticalItem[] = [];
    for (const it of itemsRaw) {
        if (!isRecord(it)) continue;

        const ingredient_id = readString(it.ingredient_id);
        const name = readString(it.name);
        const base_unit = readString(it.base_unit);
        const display_unit = ("display_unit" in it) ? (readString(it.display_unit) ?? null) : null;

        const current_stock = readNumber(it.current_stock);
        const min_stock = readNumber(it.min_stock);

        const status = readString(it.status);
        const okStatus = status === "out" || status === "low" || status === "ok";

        if (!ingredient_id || !name || !base_unit || current_stock == null || min_stock == null || !okStatus) continue;

        items.push({
            ingredient_id,
            name,
            base_unit,
            display_unit,
            current_stock,
            min_stock,
            status: status as CriticalItem["status"],
        });
    }

    return { critical_count: cc, items };
}

/* =========================
   Hook
========================= */
type Props = {
    rowsPerPage?: number;
    initialFilter?: DateFilter;
};

export default function useStockSearch({
    rowsPerPage = 20,
    initialFilter = "today",
}: Props = {}) {
    // events
    const [summary, setSummary] = useState<StockSummary>(emptySummary());
    const [events, setEvents] = useState<StockEvent[]>([]);
    const [loading, setLoading] = useState(true);

    // KPI + Critical
    const [kpi, setKpi] = useState<KpiSummary>(emptyKpi());
    const [criticalItems, setCriticalItems] = useState<CriticalItem[]>([]);
    const [criticalCount, setCriticalCount] = useState(0);
    const [loadingKpi, setLoadingKpi] = useState(false);
    const [loadingCritical, setLoadingCritical] = useState(false);

    // filters
    const [dateFilter, setDateFilter] = useState<DateFilter>(initialFilter);
    const [ingredientId, setIngredientId] = useState<string>("all");
    const [type, setType] = useState<string>("all"); // UI filter type: "all" | "deduct" | "add" | "adjust"
    const [orderId, setOrderId] = useState<string>("");

    // search
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // pagination (events-based)
    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");

    // debounce
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const refreshEvents = useCallback(
        async (signal?: AbortSignal) => {
            const params = new URLSearchParams();
            params.set("limit", "1000");

            const { from, to } = buildFromTo(dateFilter);
            if (from) params.set("from", from);
            if (to) params.set("to", to);

            const q = debouncedSearch.trim();
            if (q) params.set("q", q);

            if (ingredientId !== "all") params.set("ingredient_id", ingredientId);

            // type filter เฉพาะที่ UI รองรับ
            if (type === "deduct" || type === "add" || type === "adjust") params.set("type", type);

            const oid = orderId.trim();
            if (oid) params.set("order_id", oid);

            const res = await fetch(`/api/stock?${params.toString()}`, { cache: "no-store", signal });
            const json: unknown = await res.json().catch(() => null);

            const decoded = decodeEventsResponse(json);
            if (!decoded) {
                setSummary(emptySummary());
                setEvents([]);
                return;
            }

            setSummary(decoded.summary);
            setEvents(decoded.events);
        },
        [dateFilter, debouncedSearch, ingredientId, type, orderId]
    );

    const refreshKpiSummary = useCallback(
        async (signal?: AbortSignal) => {
            setLoadingKpi(true);
            try {
                const params = new URLSearchParams();
                params.set("mode", "summary");

                const { from, to } = buildFromTo(dateFilter);
                if (from) params.set("from", from);
                if (to) params.set("to", to);

                const res = await fetch(`/api/stock?${params.toString()}`, { cache: "no-store", signal });
                const json: unknown = await res.json().catch(() => null);

                const decoded = decodeKpi(json);
                if (!decoded) {
                    setKpi(emptyKpi());
                    return;
                }
                setKpi(decoded);
            } finally {
                setLoadingKpi(false);
            }
        },
        [dateFilter]
    );

    const refreshCritical = useCallback(async (signal?: AbortSignal) => {
        setLoadingCritical(true);
        try {
            const res = await fetch(`/api/stock?mode=critical`, { cache: "no-store", signal });
            const json: unknown = await res.json().catch(() => null);

            const decoded = decodeCritical(json);
            if (!decoded) {
                setCriticalItems([]);
                setCriticalCount(0);
                return;
            }

            setCriticalItems(decoded.items);
            setCriticalCount(decoded.critical_count);
        } finally {
            setLoadingCritical(false);
        }
    }, []);

    // fetch all
    useEffect(() => {
        const ac = new AbortController();
        let alive = true;

        async function loadAll() {
            try {
                setLoading(true);
                await Promise.all([
                    refreshEvents(ac.signal),
                    refreshKpiSummary(ac.signal),
                    refreshCritical(ac.signal),
                ]);
            } catch (e) {
                if (!alive) return;
                console.error("โหลด stock ผิดพลาด:", e);
                setSummary(emptySummary());
                setEvents([]);
                setKpi(emptyKpi());
                setCriticalItems([]);
                setCriticalCount(0);
            } finally {
                if (alive) setLoading(false);
            }
        }

        loadAll();

        return () => {
            alive = false;
            ac.abort();
        };
    }, [refreshEvents, refreshKpiSummary, refreshCritical]);

    // reset page when filters change
    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [dateFilter, debouncedSearch, ingredientId, type, orderId]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(events.length / rowsPerPage)),
        [events.length, rowsPerPage]
    );

    useEffect(() => {
        if (page > totalPages) setPage(1);
    }, [page, totalPages]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    const paginatedEvents = useMemo(() => {
        const safePage = Math.min(Math.max(1, page), totalPages);
        const start = (safePage - 1) * rowsPerPage;
        return events.slice(start, start + rowsPerPage);
    }, [events, page, rowsPerPage, totalPages]);

    return {
        // loading
        loading,
        loadingKpi,
        loadingCritical,

        // data
        summary,
        events,
        paginatedEvents,

        // kpi + critical
        kpi,
        criticalItems,
        criticalCount,

        // filters
        dateFilter,
        setDateFilter,
        ingredientId,
        setIngredientId,
        type,
        setType,
        orderId,
        setOrderId,

        // search
        search,
        setSearch,
        debouncedSearch,

        // pagination
        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        // refresh
        refreshEvents: () => refreshEvents(),
        refreshKpi: () => refreshKpiSummary(),
        refreshCritical: () => refreshCritical(),
    };
}
