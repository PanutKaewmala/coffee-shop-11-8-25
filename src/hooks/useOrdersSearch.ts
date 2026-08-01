// hooks/useOrdersSearch.ts
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { OrderItem } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

type OrderStatusUI = "paid" | "cancelled" | "void" | "refunded";
type PaymentMethodUI = "cash" | "promptpay";

type StatusFilter = "all" | OrderStatusUI;
type PaymentFilter = "all" | PaymentMethodUI;

// ✅ KPI preset (เฉพาะช่วงที่ summary รองรับ)
type Preset = "today" | "7days" | "month";

export type OrderLite = {
    id: string;
    total: number;
    created_at: string;

    status: OrderStatusUI;
    payment_method: PaymentMethodUI;

    paid_at: string | null;
    note: string | null;

    cancel_reason: string | null;
    cancel_note: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;

    items: OrderItem[];
};

interface UseOrdersSearchOptions {
    rowsPerPage?: number;
    initialFilter?: DateFilter;
}

function safeDate(dateStr: string) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
}

function orderFilterTimestamp(order: OrderLite): string {
    if (order.status === "paid") return order.paid_at ?? order.created_at;
    if (order.status === "cancelled" || order.status === "void" || order.status === "refunded") {
        return order.cancelled_at ?? order.created_at;
    }
    return order.created_at;
}

function isOrderStatus(v: unknown): v is OrderStatusUI {
    return v === "paid" || v === "cancelled" || v === "void" || v === "refunded";
}

function isPaymentMethod(v: unknown): v is PaymentMethodUI {
    return v === "cash" || v === "promptpay";
}

function readStringOrNull(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}

function readNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function isNotNull<T>(v: T | null): v is T {
    return v !== null;
}

/* =========================
   ✅ Bangkok day-boundary helpers
   - ใช้กับ "ตาราง/ฟิลเตอร์" และ "KPI preset" ให้มาตรฐานเดียวกัน
========================= */
const TZ = "Asia/Bangkok";

// YYYY-MM-DD in Bangkok
function fmtKey(d: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

function keyToDate(key: string): Date {
    // key is YYYY-MM-DD
    return new Date(`${key}T00:00:00+07:00`);
}

function addDaysKey(key: string, days: number): string {
    const d = keyToDate(key);
    d.setDate(d.getDate() + days);
    return fmtKey(d);
}

function firstDayOfMonthKey(key: string): string {
    return `${key.slice(0, 7)}-01`;
}

function firstDayNextMonthKey(key: string): string {
    const d = keyToDate(firstDayOfMonthKey(key));
    d.setMonth(d.getMonth() + 1);
    // fmtKey(d) returns YYYY-MM-DD but could be not 01 due to date object,
    // so force "-01" with the computed month
    return fmtKey(d).slice(0, 7) + "-01";
}

// compare YYYY-MM-DD keys (Bangkok boundary)
function inBangkokRange(d: Date, startKey: string, endKey: string) {
    const k = fmtKey(d);
    return k >= startKey && k < endKey;
}

function inExactBangkokDay(d: Date, dateKey: string) {
    const start = keyToDate(dateKey).getTime();
    const end = keyToDate(addDaysKey(dateKey, 1)).getTime();
    const timestamp = d.getTime();
    return timestamp >= start && timestamp < end;
}

// ✅ ใช้สร้างช่วงของ "ตาราง" ตาม dateFilter โดยอิง Bangkok 00:00
function getListRangeKeysByDateFilter(df: DateFilter, todayKey: string) {
    if (df === "today") {
        return { startKey: todayKey, endKey: addDaysKey(todayKey, 1) };
    }
    if (df === "yesterday") {
        const startKey = addDaysKey(todayKey, -1);
        const endKey = todayKey;
        return { startKey, endKey };
    }
    if (df === "7days") {
        // ✅ 7 วันล่าสุดแบบ "วันปฏิทิน" => วันนี้ + ย้อนหลังอีก 6 วัน = รวม 7 วัน
        return { startKey: addDaysKey(todayKey, -6), endKey: addDaysKey(todayKey, 1) };
    }
    if (df === "month") {
        const startKey = firstDayOfMonthKey(todayKey);
        const endKey = firstDayNextMonthKey(todayKey);
        return { startKey, endKey };
    }
    return null; // all
}

function presetFromDateFilter(df: DateFilter): Preset | null {
    if (df === "today") return "today";
    if (df === "7days") return "7days";
    if (df === "month") return "month";
    return null;
}

function getPresetRangeKeys(preset: Preset, todayKey: string) {
    if (preset === "today") {
        return { startKey: todayKey, endKey: addDaysKey(todayKey, 1) };
    }
    if (preset === "7days") {
        return { startKey: addDaysKey(todayKey, -6), endKey: addDaysKey(todayKey, 1) };
    }
    const startKey = firstDayOfMonthKey(todayKey);
    const endKey = firstDayNextMonthKey(todayKey);
    return { startKey, endKey };
}

export default function useOrdersSearch({
    rowsPerPage = 20,
    initialFilter = "today",
}: UseOrdersSearchOptions = {}) {
    /* -------------------- STATE -------------------- */
    const [orders, setOrders] = useState<OrderLite[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [dateFilter, setDateFilterState] = useState<DateFilter>(initialFilter);
    const [exactDate, setExactDateState] = useState("");

    const setDateFilter = useCallback((value: DateFilter) => {
        setDateFilterState(value);
        setExactDateState("");
    }, []);
    const setExactDate = useCallback((value: string) => {
        setExactDateState(value);
        if (value) setDateFilterState("all");
    }, []);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");

    /* -------------------- LOAD DATA -------------------- */
    const loadOrders = useCallback(async () => {
        try {
            setLoading(true);

            const res = await fetch("/api/orders", { cache: "no-store" });
            const json: unknown = await res.json().catch(() => null);

            const list =
                json &&
                    typeof json === "object" &&
                    json !== null &&
                    Array.isArray((json as Record<string, unknown>).orders)
                    ? ((json as Record<string, unknown>).orders as unknown[])
                    : [];

            const normalized = list
                .map((raw): OrderLite | null => {
                    if (!raw || typeof raw !== "object") return null;
                    const o = raw as Record<string, unknown>;

                    const id = typeof o.id === "string" ? o.id : "";
                    const created_at = typeof o.created_at === "string" ? o.created_at : "";
                    if (!id || !created_at) return null;

                    const total = readNumber(o.total, 0);

                    const status: OrderStatusUI = isOrderStatus(o.status) ? o.status : "paid";
                    const payment_method: PaymentMethodUI = isPaymentMethod(o.payment_method)
                        ? o.payment_method
                        : "cash";

                    const items: OrderItem[] = Array.isArray(o.items) ? (o.items as OrderItem[]) : [];

                    return {
                        id,
                        total,
                        created_at,

                        status,
                        payment_method,

                        paid_at: readStringOrNull(o.paid_at),
                        note: readStringOrNull(o.note),

                        cancel_reason: readStringOrNull(o.cancel_reason),
                        cancel_note: readStringOrNull(o.cancel_note),
                        cancelled_at: readStringOrNull(o.cancelled_at),
                        cancelled_by: readStringOrNull(o.cancelled_by),

                        items,
                    };
                })
                .filter(isNotNull);

            setOrders(normalized);
        } catch (err) {
            console.error("โหลดออเดอร์ผิดพลาด:", err);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    /* -------------------- DEBOUNCE SEARCH -------------------- */
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    /* -------------------- QUICK DATE FILTER (LIST uses created_at, Bangkok boundary) -------------------- */
    const isWithinFilter = useCallback(
        (order: OrderLite) => {
            const d = safeDate(orderFilterTimestamp(order));
            if (!d) return false;
            if (exactDate) return inExactBangkokDay(d, exactDate);
            const todayKey = fmtKey(new Date());
            const range = getListRangeKeysByDateFilter(dateFilter, todayKey);
            if (!range) return true;
            return inBangkokRange(d, range.startKey, range.endKey);
        },
        [dateFilter, exactDate]
    );

    /* -------------------- FILTER + SORT (LIST) -------------------- */
    const filteredOrders = useMemo(() => {
        let result = orders.filter(isWithinFilter);

        if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
        if (paymentFilter !== "all") result = result.filter((o) => o.payment_method === paymentFilter);

        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter((o) => {
                const searchable = [
                    o.id,
                    o.note,
                    o.cancel_reason,
                    o.cancel_note,
                    ...o.items.map((item) => item.name),
                ].filter(Boolean).join(" ").toLowerCase();
                return searchable.includes(q);
            });
        }

        return result
            .slice()
            .sort((a, b) => (safeDate(b.created_at)?.getTime() ?? 0) - (safeDate(a.created_at)?.getTime() ?? 0));
    }, [orders, debouncedSearch, isWithinFilter, statusFilter, paymentFilter]);

    /* -------------------- PAGINATION -------------------- */
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage)),
        [filteredOrders.length, rowsPerPage]
    );

    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [debouncedSearch, dateFilter, exactDate, statusFilter, paymentFilter]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredOrders.slice(start, start + rowsPerPage);
    }, [filteredOrders, page, rowsPerPage]);

    /* =========================
       ✅ LIST-based paid KPI (ตรงกับตาราง/ฟิลเตอร์/คำค้นหา)
    ========================= */
    const paidList = useMemo(() => {
        let paidTotal = 0;
        let paidCount = 0;

        for (const o of filteredOrders) {
            if (o.status !== "paid") continue;
            paidCount += 1;
            paidTotal += Number.isFinite(o.total) ? o.total : 0;
        }

        return { paidTotal, paidCount };
    }, [filteredOrders]);

    /* =========================
       ✅ PRESET paid_at KPI (match /api/revenue/summary)
       - ไม่สน status/payment/search filters (ให้ตรงกับ API summary)
    ========================= */
    const preset = useMemo(() => presetFromDateFilter(dateFilter), [dateFilter]);

    const paidPreset = useMemo(() => {
        if (!preset) return { paidTotal: 0, paidCount: 0 };

        const todayKey = fmtKey(new Date());
        const { startKey, endKey } = getPresetRangeKeys(preset, todayKey);

        let paidTotal = 0;
        let paidCount = 0;

        for (const o of orders) {
            if (o.status !== "paid") continue;
            if (!o.paid_at) continue;

            const d = safeDate(o.paid_at);
            if (!d) continue;

            if (!inBangkokRange(d, startKey, endKey)) continue;

            paidCount += 1;
            paidTotal += Number.isFinite(o.total) ? o.total : 0;
        }

        return { paidTotal, paidCount };
    }, [orders, preset]);

    return {
        loading,

        orders,
        filteredOrders,
        paginatedOrders,

        search,
        setSearch,
        debouncedSearch,

        dateFilter,
        setDateFilter,
        exactDate,
        setExactDate,

        statusFilter,
        setStatusFilter,
        paymentFilter,
        setPaymentFilter,

        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        // ✅ list-based KPI (match table)
        paidTotalList: paidList.paidTotal,
        paidCountList: paidList.paidCount,

        // ✅ preset paid_at KPI (match summary)
        paidTotalPreset: paidPreset.paidTotal,
        paidCountPreset: paidPreset.paidCount,

        refresh: loadOrders,
    };
}
